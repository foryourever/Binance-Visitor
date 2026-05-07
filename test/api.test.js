import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';

test('api adds monitored symbols through normalized Binance client', async () => {
  const harness = await createHarness();
  try {
    const response = await fetch(`${harness.url}/api/symbols`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'btc' })
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.symbol.symbol, 'BTCUSDT');
    assert.deepEqual(harness.marketMonitor.added, ['BTCUSDT']);
  } finally {
    await harness.close();
  }
});

test('api refuses real copy-trading execution with explicit not implemented status', async () => {
  const harness = await createHarness();
  try {
    const response = await fetch(`${harness.url}/api/copy/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leaderId: 'abc123' })
    });
    const body = await response.json();

    assert.equal(response.status, 501);
    assert.match(body.error, /第一版不支持真实跟单下单/);
  } finally {
    await harness.close();
  }
});

async function createHarness() {
  const store = createStore(':memory:');
  const marketMonitor = {
    added: [],
    removed: [],
    addSymbol(symbol) {
      this.added.push(symbol);
    },
    removeSymbol(symbol) {
      this.removed.push(symbol);
    },
    getStatus() {
      return { marketStream: 'idle' };
    }
  };
  const leaderMonitor = {
    async poll() {},
    getStatus() {
      return { leaderPoller: 'idle' };
    }
  };
  const binanceClient = {
    async resolveTradingSymbol(input) {
      return `${String(input).trim().toUpperCase()}USDT`;
    }
  };
  const app = createApp({ store, binanceClient, marketMonitor, leaderMonitor });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return {
    store,
    marketMonitor,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      store.close();
    }
  };
}
