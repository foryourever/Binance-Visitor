import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../server/store.js';

test('store deduplicates leader trades by leader symbol side time price and qty', () => {
  const store = createStore(':memory:');
  const trade = {
    leaderId: 'leader-1',
    symbol: 'BTCUSDT',
    side: 'LONG',
    eventTime: 1710000000000,
    price: 65000,
    qty: 0.12,
    action: 'OPEN'
  };

  const first = store.insertLeaderTrade(trade);
  const second = store.insertLeaderTrade(trade);

  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  assert.equal(store.listLeaderTrades(10).length, 1);
  store.close();
});

test('store upserts monitored leaders and symbols with visible status', () => {
  const store = createStore(':memory:');

  store.upsertLeader('abc123');
  store.upsertSymbol('BTCUSDT');

  assert.equal(store.listLeaders()[0].leaderId, 'abc123');
  assert.equal(store.listLeaders()[0].status, 'active');
  assert.equal(store.listSymbols()[0].symbol, 'BTCUSDT');
  assert.equal(store.listSymbols()[0].status, 'active');
  store.close();
});

test('store keeps recent klines ordered by open time for chart rendering', () => {
  const store = createStore(':memory:');

  store.upsertKline({
    symbol: 'BTCUSDT',
    interval: '1m',
    openTime: 2000,
    closeTime: 2999,
    open: 101,
    high: 103,
    low: 100,
    close: 102,
    volume: 8,
    isClosed: true
  });
  store.upsertKline({
    symbol: 'BTCUSDT',
    interval: '1m',
    openTime: 1000,
    closeTime: 1999,
    open: 99,
    high: 102,
    low: 98,
    close: 101,
    volume: 5,
    isClosed: true
  });

  assert.deepEqual(store.listKlines('BTCUSDT', '1m', 10).map((item) => item.close), [101, 102]);
  store.close();
});

test('store persists leader profile and metrics snapshots', () => {
  const store = createStore(':memory:');
  store.upsertLeader('4872767084124315648');
  store.updateLeaderSnapshot('4872767084124315648', {
    profile: {
      displayName: 'ETH 阿辰',
      source: 'arena',
      followers: 144,
      copiers: 144
    },
    metrics: {
      roi90d: 114.6,
      pnl: 4386.77,
      winRate: 95.83,
      maxDrawdown: 5.25
    }
  });

  const leader = store.getLeader('4872767084124315648');

  assert.equal(leader.displayName, 'ETH 阿辰');
  assert.equal(leader.source, 'arena');
  assert.equal(leader.profile.followers, 144);
  assert.equal(leader.metrics.winRate, 95.83);
  store.close();
});
