import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const DEFAULT_WEB_PRODUCT_URL = 'https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products?includeEtf=true';
const execFileAsync = promisify(execFile);

export class BinanceWebProductClient {
  constructor({
    fetchImpl = fetch,
    endpoint = process.env.BINANCE_WEB_PRODUCT_ENDPOINT || DEFAULT_WEB_PRODUCT_URL,
    language = process.env.BINANCE_LANGUAGE || 'zh-CN',
    fallbackJsonFetch = fetchJsonViaPowerShell
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.endpoint = endpoint;
    this.language = language;
    this.fallbackJsonFetch = fallbackJsonFetch;
  }

  async fetchTickers(symbols) {
    const wanted = new Set(symbols);
    if (wanted.size === 0) {
      return [];
    }

    const payload = await this.fetchProductPayload();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const now = Date.now();
    return rows
      .filter((row) => wanted.has(row.s))
      .map((row) => parseWebProductTicker(row, now))
      .filter(Boolean);
  }

  async fetchProductPayload() {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        headers: {
          'accept': 'application/json',
          'accept-language': this.language,
          'clienttype': 'web'
        }
      });
      if (!response.ok) {
        throw new Error(`Binance 中文网页端行情请求失败: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      if (process.platform === 'win32') {
        return this.fallbackJsonFetch(this.endpoint, this.language);
      }
      throw error;
    }
  }
}

export async function fetchJsonViaPowerShell(url, language = 'zh-CN') {
  const script = [
    '& { param($uri, $language)',
    '$ProgressPreference = "SilentlyContinue";',
    '$headers = @{ "Accept" = "application/json"; "Accept-Language" = $language; "clienttype" = "web" };',
    'Invoke-RestMethod -Uri $uri -Headers $headers | ConvertTo-Json -Depth 30 -Compress',
    '}'
  ].join(' ');
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
    url,
    language
  ], {
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

export function parseWebProductTicker(row, eventTime = Date.now()) {
  const open = Number(row.o);
  const close = Number(row.c);
  if (!row.s || !Number.isFinite(open) || !Number.isFinite(close)) {
    return null;
  }

  return {
    type: 'ticker',
    source: 'binance-web-zh-cn',
    eventTime,
    symbol: row.s,
    lastPrice: close,
    priceChangePercent: roundPercent(open === 0 ? 0 : ((close - open) / open) * 100),
    volume: Number(row.v ?? 0),
    quoteVolume: Number(row.qv ?? 0)
  };
}

export function tickerToSyntheticKline(ticker, interval = '1m') {
  const openTime = Math.floor(ticker.eventTime / 60000) * 60000;
  return {
    type: 'kline',
    source: ticker.source,
    eventTime: ticker.eventTime,
    symbol: ticker.symbol,
    interval,
    openTime,
    closeTime: openTime + 59999,
    open: ticker.lastPrice,
    high: ticker.lastPrice,
    low: ticker.lastPrice,
    close: ticker.lastPrice,
    volume: ticker.volume,
    isClosed: false
  };
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}
