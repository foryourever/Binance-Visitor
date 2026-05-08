import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArenaTraderData, ArenaTraderClient } from '../server/services/arenaClient.js';

const sampleHtml = String.raw`
<script>self.__next_f.push([1,"serverTraderData\":{\"profile\":{\"handle\":\"ETH Achen\",\"id\":\"4872767084124315648\",\"followers\":144,\"copiers\":144,\"avatar_url\":\"https://example.com/a.jpg\",\"source\":\"binance_futures\",\"market_type\":\"futures\",\"profile_url\":\"https://www.binance.com/en/copy-trading/lead-details?portfolioId=4872767084124315648\"},\"performance\":{\"roi_90d\":114.60949055,\"pnl\":4386.77177177,\"win_rate\":95.8333,\"max_drawdown\":5.2552316,\"arena_score\":40.29},\"portfolio\":[{\"market\":\"ETHUSDT\",\"direction\":\"long\",\"invested\":12.5,\"pnl\":1.2,\"value\":13.7,\"price\":2285.57},{\"market\":\"BTCUSDT\",\"direction\":\"short\",\"invested\":20,\"pnl\":-0.5,\"value\":19.5,\"price\":79933.7}],\"positionHistory\":[]}"])</script>
`;

test('parseArenaTraderData extracts profile metrics and portfolio', () => {
  const data = parseArenaTraderData(sampleHtml);

  assert.equal(data.profile.handle, 'ETH Achen');
  assert.equal(data.profile.id, '4872767084124315648');
  assert.equal(data.metrics.roi90d, 114.60949055);
  assert.equal(data.metrics.winRate, 95.8333);
  assert.equal(data.portfolio.length, 2);
  assert.equal(data.portfolio[0].symbol, 'ETHUSDT');
  assert.equal(data.portfolio[0].side, 'LONG');
});

test('ArenaTraderClient resolves known portfolio id to handle and returns synthetic trades', async () => {
  const client = new ArenaTraderClient({
    fetchImpl: async (url) => ({
      ok: true,
      url,
      async text() {
        return sampleHtml;
      }
    }),
    handleMap: {
      '4872767084124315648': 'ETH Achen'
    }
  });

  const snapshot = await client.fetchSnapshot('4872767084124315648');

  assert.match(snapshot.sourceUrl, /ETH%20Achen/);
  assert.equal(snapshot.profile.displayName, 'ETH Achen');
  assert.equal(snapshot.trades.length, 2);
  assert.equal(snapshot.trades[1].side, 'SHORT');
});
