export function normalizeFuturesSymbol(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!raw) {
    throw new Error('请输入币种');
  }
  if (!/^[A-Z0-9]{2,20}$/.test(raw)) {
    throw new Error('币种格式不正确');
  }
  return raw.endsWith('USDT') ? raw : `${raw}USDT`;
}

export function assertTradingSymbol(exchangeInfo, symbol) {
  const item = exchangeInfo?.symbols?.find((entry) => entry.symbol === symbol);
  if (!item) {
    throw new Error('不支持该 U 本位合约');
  }
  if (item.status !== 'TRADING') {
    throw new Error('该 U 本位合约当前不可交易');
  }
  return item;
}

export async function fetchExchangeInfo(fetchImpl = fetch) {
  const response = await fetchImpl('https://fapi.binance.com/fapi/v1/exchangeInfo');
  if (!response.ok) {
    throw new Error(`Binance exchangeInfo 请求失败: ${response.status}`);
  }
  return response.json();
}
