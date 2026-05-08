import WebSocket from 'ws';
import { parseCombinedMarketMessage } from './marketParser.js';
import { BinanceWebProductClient, tickerToSyntheticKline } from './webProductClient.js';

const STREAM_HOST = 'wss://fstream.binance.com/stream?streams=';

export class MarketMonitor {
  constructor({
    store,
    realtime,
    logger = console,
    webProductClient = new BinanceWebProductClient(),
    fallbackPollMs = Number(process.env.BINANCE_WEB_FALLBACK_POLL_MS || 5000)
  } = {}) {
    this.store = store;
    this.realtime = realtime;
    this.logger = logger;
    this.webProductClient = webProductClient;
    this.fallbackPollMs = fallbackPollMs;
    this.symbols = new Set();
    this.socket = null;
    this.fallbackTimer = null;
    this.status = 'idle';
    this.lastError = null;
    this.fallbackStatus = 'idle';
    this.fallbackLastError = null;
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
      this.stopFallbackPolling();
      this.realtime?.broadcast('system.status.updated', this.getStatus());
      return;
    }

    this.startFallbackPolling();

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

  startFallbackPolling() {
    if (this.fallbackTimer) {
      return;
    }
    this.fallbackStatus = 'polling';
    this.pollWebProductFallback();
    this.fallbackTimer = setInterval(() => this.pollWebProductFallback(), this.fallbackPollMs);
  }

  stopFallbackPolling() {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.fallbackStatus = 'idle';
  }

  async pollWebProductFallback() {
    try {
      const ticks = await this.webProductClient.fetchTickers([...this.symbols]);
      for (const tick of ticks) {
        const kline = tickerToSyntheticKline(tick);
        this.store.upsertTicker(tick);
        this.store.upsertKline(kline);
        this.realtime?.broadcast('market.ticker.updated', tick);
        this.realtime?.broadcast('market.kline.updated', kline);
      }
      this.fallbackStatus = 'ok';
      this.fallbackLastError = null;
      this.realtime?.broadcast('system.status.updated', this.getStatus());
    } catch (error) {
      this.fallbackStatus = 'error';
      this.fallbackLastError = error.message;
      this.logger.warn?.('Binance web product fallback error', error);
      this.realtime?.broadcast('system.status.updated', this.getStatus());
    }
  }

  getStatus() {
    return {
      marketStream: this.status,
      marketSymbols: [...this.symbols],
      marketLastError: this.lastError,
      webFallback: this.fallbackStatus,
      webFallbackLastError: this.fallbackLastError
    };
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
    this.stopFallbackPolling();
  }
}
