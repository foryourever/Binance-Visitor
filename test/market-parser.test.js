import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCombinedMarketMessage } from '../server/services/marketParser.js';

test('parseCombinedMarketMessage parses ticker stream messages', () => {
  const parsed = parseCombinedMarketMessage(JSON.stringify({
    stream: 'btcusdt@ticker',
    data: {
      e: '24hrTicker',
      E: 1710000000000,
      s: 'BTCUSDT',
      c: '65000.5',
      P: '2.35',
      v: '1234.5',
      q: '81000000'
    }
  }));

  assert.equal(parsed.type, 'ticker');
  assert.equal(parsed.symbol, 'BTCUSDT');
  assert.equal(parsed.lastPrice, 65000.5);
});

test('parseCombinedMarketMessage parses kline stream messages', () => {
  const parsed = parseCombinedMarketMessage(JSON.stringify({
    stream: 'btcusdt@kline_1m',
    data: {
      e: 'kline',
      E: 1710000000000,
      s: 'BTCUSDT',
      k: {
        t: 1710000000000,
        T: 1710000059999,
        i: '1m',
        o: '65000',
        h: '65100',
        l: '64950',
        c: '65050',
        v: '80.5',
        x: false
      }
    }
  }));

  assert.equal(parsed.type, 'kline');
  assert.equal(parsed.symbol, 'BTCUSDT');
  assert.equal(parsed.interval, '1m');
  assert.equal(parsed.close, 65050);
});
