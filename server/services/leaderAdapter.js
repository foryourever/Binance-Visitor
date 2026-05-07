export class BinanceLeaderboardAdapter {
  constructor({ fetchImpl = fetch, endpoint = process.env.BINANCE_LEADER_POSITION_ENDPOINT } = {}) {
    this.fetchImpl = fetchImpl;
    this.endpoint = endpoint || 'https://www.binance.com/bapi/futures/v1/public/future/leaderboard/getOtherPosition';
  }

  async fetchTrades(leaderId) {
    if (!/^[A-Za-z0-9_-]{3,128}$/.test(leaderId)) {
      throw new Error('带单员 ID 格式不正确');
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'clienttype': 'web'
      },
      body: JSON.stringify({
        encryptedUid: leaderId,
        tradeType: 'PERPETUAL'
      })
    });

    if (!response.ok) {
      throw new Error(`Binance 带单员数据请求失败: ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.data?.otherPositionRetList)
      ? payload.data.otherPositionRetList
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

    return rows.map((row) => normalizePositionRow(leaderId, row)).filter(Boolean);
  }
}

function normalizePositionRow(leaderId, row) {
  const symbol = row.symbol || row.tradePair || row.baseAsset;
  const amount = Number(row.amount ?? row.positionAmount ?? row.qty ?? 0);
  const entryPrice = Number(row.entryPrice ?? row.price ?? row.markPrice ?? 0);
  if (!symbol || !Number.isFinite(amount) || amount === 0) {
    return null;
  }

  return {
    leaderId,
    symbol: String(symbol).toUpperCase().endsWith('USDT') ? String(symbol).toUpperCase() : `${String(symbol).toUpperCase()}USDT`,
    side: amount > 0 ? 'LONG' : 'SHORT',
    action: 'POSITION',
    eventTime: Number(row.updateTime ?? row.time ?? Date.now()),
    price: entryPrice,
    qty: Math.abs(amount),
    raw: row
  };
}
