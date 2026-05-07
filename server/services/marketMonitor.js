import WebSocket from 'ws';
import { parseCombinedMarketMessage } from './marketParser.js';

const STREAM_HOST = 'wss://fstream.binance.com/stream?streams=';

export class MarketMonitor {
  constructor({ store, realtime, logger = console } = {}) {
    this.store = store;
    this.realtime = realtime;
    this.logger = logger;
    this.symbols = new Set();
    this.socket = null;
    this.status = 'idle';
    this.lastError = null;
  }

  setSymbols(symbols) {
    this.symbols = new Set(symbols);
    this.reconnect();
  }

  addSymbol(symbol) {
    this.symbols.add(symbol);
    this.reconnect();
  }

  removeSymbol(symbol) {
    this.symbols.delete(symbol);
    this.reconnect();
  }

  reconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
    if (this.symbols.size === 0) {
      this.status = 'idle';
      this.realtime?.broadcast('system.status.updated', this.getStatus());
      return;
    }

    const streams = [...this.symbols]
      .flatMap((symbol) => [`${symbol.toLowerCase()}@ticker`, `${symbol.toLowerCase()}@kline_1m`])
      .join('/');
    this.status = 'connecting';
    this.socket = new WebSocket(`${STREAM_HOST}${streams}`);

    this.socket.on('open', () => {
      this.status = 'connected';
      this.lastError = null;
      this.realtime?.broadcast('system.status.updated', this.getStatus());
    });

    this.socket.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.socket.on('error', (error) => {
      this.status = 'error';
      this.lastError = error.message;
      this.logger.warn?.('Binance market stream error', error);
      this.realtime?.broadcast('system.status.updated', this.getStatus());
    });

    this.socket.on('close', () => {
      if (this.symbols.size > 0 && this.status !== 'idle') {
        this.status = 'disconnected';
        this.realtime?.broadcast('system.status.updated', this.getStatus());
      }
    });
  }

  handleMessage(raw) {
    const parsed = parseCombinedMarketMessage(raw);
    if (parsed.type === 'ticker') {
      this.store.upsertTicker(parsed);
      this.realtime?.broadcast('market.ticker.updated', parsed);
    }
    if (parsed.type === 'kline') {
      this.store.upsertKline(parsed);
      this.realtime?.broadcast('market.kline.updated', parsed);
    }
  }

  getStatus() {
    return {
      marketStream: this.status,
      marketSymbols: [...this.symbols],
      marketLastError: this.lastError
    };
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
  }
}
