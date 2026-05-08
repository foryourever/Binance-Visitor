import test from 'node:test';
import assert from 'node:assert/strict';

import { BinanceWebProductClient, parseWebProductTicker } from '../server/services/webProductClient.js';

test('parseWebProductTicker maps Binance web product fields to ticker payload', () => {
  const parsed = parseWebProductTicker({
    s: 'ETHUSDT',
    o: '2334.46',
    c: '2285.75',
    v: '483699.68',
    qv: '1110488566.25'
  }, 1710000000000);

  assert.deepEqual(parsed, {
    type: 'ticker',
    source: 'binance-web-zh-cn',
    eventTime: 1710000000000,
    symbol: 'ETHUSDT',
    lastPrice: 2285.75,
    priceChangePercent: -2.09,
    volume: 483699.68,
    quoteVolume: 1110488566.25
  });
});

test('BinanceWebProductClient uses fallback JSON fetch when Node fetch cannot connect', async () => {
  const client = new BinanceWebProductClient({
    fetchImpl: async () => {
      throw new Error('fetch failed');
    },
    fallbackJsonFetch: async () => ({
      data: [
        { s: 'BTCUSDT', o: '100', c: '105', v: '2', qv: '210' },
        { s: 'DOGEUSDT', o: '1', c: '2', v: '3', qv: '4' }
      ]
    })
  });

  const ticks = await client.fetchTickers(['BTCUSDT']);

  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].symbol, 'BTCUSDT');
  assert.equal(ticks[0].lastPrice, 105);
});
