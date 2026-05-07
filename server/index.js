import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { createRealtimeServer } from './realtime.js';
import { createStore } from './store.js';
import { BinanceClient } from './services/binanceClient.js';
import { MarketMonitor } from './services/marketMonitor.js';
import { BinanceLeaderboardAdapter } from './services/leaderAdapter.js';
import { LeaderMonitor } from './services/leaderMonitor.js';

const port = Number(process.env.PORT ?? 5174);
const store = createStore(process.env.SQLITE_PATH ?? 'data/monitor.sqlite');

let realtime;
const realtimeProxy = {
  broadcast(type, payload) {
    realtime?.broadcast(type, payload);
  },
  close() {
    realtime?.close();
  },
  clientCount() {
    return realtime?.clientCount() ?? 0;
  }
};
const binanceClient = new BinanceClient();
const marketMonitor = new MarketMonitor({ store, realtime: realtimeProxy });
const leaderMonitor = new LeaderMonitor({
  store,
  adapter: new BinanceLeaderboardAdapter(),
  realtime: realtimeProxy,
  intervalMs: Number(process.env.LEADER_POLL_INTERVAL_MS ?? 30000)
});

const app = createApp({ store, binanceClient, marketMonitor, leaderMonitor });
const server = http.createServer(app);
realtime = createRealtimeServer(server, () => ({
  leaders: store.listLeaders(),
  symbols: store.listSymbols(),
  klines: Object.fromEntries(store.listSymbols().map((item) => [
    item.symbol,
    store.listKlines(item.symbol, '1m', 120)
  ])),
  trades: store.listLeaderTrades(100),
  status: {
    ...marketMonitor.getStatus(),
    ...leaderMonitor.getStatus()
  }
}));

marketMonitor.setSymbols(store.listSymbols().map((item) => item.symbol));
leaderMonitor.start();

server.listen(port, () => {
  console.log(`Binance copy monitor listening on http://localhost:${port}`);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  leaderMonitor.close();
  marketMonitor.close();
  realtime.close();
  store.close();
  server.close(() => process.exit(0));
}
