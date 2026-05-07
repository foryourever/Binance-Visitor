import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFuturesSymbol, assertTradingSymbol } from '../server/services/symbols.js';
import { BinanceClient } from '../server/services/binanceClient.js';

test('normalizeFuturesSymbol maps coin names to USDT futures symbols', () => {
  assert.equal(normalizeFuturesSymbol('btc'), 'BTCUSDT');
  assert.equal(normalizeFuturesSymbol(' ETH '), 'ETHUSDT');
  assert.equal(normalizeFuturesSymbol('SOLUSDT'), 'SOLUSDT');
});

test('normalizeFuturesSymbol rejects invalid input', () => {
  assert.throws(() => normalizeFuturesSymbol(''), /请输入币种/);
  assert.throws(() => normalizeFuturesSymbol('btc/usdt'), /币种格式不正确/);
});

test('assertTradingSymbol accepts only TRADING USD-M symbols', () => {
  const info = {
    symbols: [
      { symbol: 'BTCUSDT', status: 'TRADING', contractType: 'PERPETUAL' },
      { symbol: 'OLDUSDT', status: 'BREAK', contractType: 'PERPETUAL' }
    ]
  };

  assert.deepEqual(assertTradingSymbol(info, 'BTCUSDT'), {
    symbol: 'BTCUSDT',
    status: 'TRADING',
    contractType: 'PERPETUAL'
  });
  assert.throws(() => assertTradingSymbol(info, 'OLDUSDT'), /当前不可交易/);
  assert.throws(() => assertTradingSymbol(info, 'DOGEUSDT'), /不支持该 U 本位合约/);
});

test('BinanceClient falls back to normalized symbol when exchangeInfo is unreachable', async () => {
  const client = new BinanceClient({
    fetchImpl: async () => {
      throw new Error('fetch failed');
    }
  });

  assert.equal(await client.resolveTradingSymbol('btc'), 'BTCUSDT');
});
