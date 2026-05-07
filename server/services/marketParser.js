export function parseCombinedMarketMessage(raw) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const data = payload.data ?? payload;

  if (data.e === '24hrTicker') {
    return {
      type: 'ticker',
      eventTime: Number(data.E),
      symbol: data.s,
      lastPrice: Number(data.c),
      priceChangePercent: Number(data.P),
      volume: Number(data.v),
      quoteVolume: Number(data.q)
    };
  }

  if (data.e === 'kline') {
    return {
      type: 'kline',
      eventTime: Number(data.E),
      symbol: data.s,
      interval: data.k.i,
      openTime: Number(data.k.t),
      closeTime: Number(data.k.T),
      open: Number(data.k.o),
      high: Number(data.k.h),
      low: Number(data.k.l),
      close: Number(data.k.c),
      volume: Number(data.k.v),
      isClosed: Boolean(data.k.x)
    };
  }

  return { type: 'unknown', raw: payload };
}
