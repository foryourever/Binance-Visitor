import { WebSocketServer } from 'ws';

export function createRealtimeServer(server, getSnapshot) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();

  wss.on('connection', (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: 'snapshot', payload: getSnapshot() }));
    socket.on('close', () => clients.delete(socket));
  });

  return {
    broadcast(type, payload) {
      const message = JSON.stringify({ type, payload });
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      }
    },
    clientCount() {
      return clients.size;
    },
    close() {
      wss.close();
    }
  };
}
