import { assertTradingSymbol, fetchExchangeInfo, normalizeFuturesSymbol } from './symbols.js';

export class BinanceClient {
  constructor({ fetchImpl = fetch, allowUnverifiedFallback = true } = {}) {
    this.fetchImpl = fetchImpl;
    this.allowUnverifiedFallback = allowUnverifiedFallback;
    this.exchangeInfo = null;
    this.exchangeInfoFetchedAt = 0;
    this.lastValidationError = null;
  }

  async resolveTradingSymbol(input) {
    const symbol = normalizeFuturesSymbol(input);
    try {
      const info = await this.getExchangeInfo();
      this.lastValidationError = null;
      return assertTradingSymbol(info, symbol).symbol;
    } catch (error) {
      this.lastValidationError = error.message;
      if (this.allowUnverifiedFallback && isNetworkValidationError(error)) {
        return symbol;
      }
      throw error;
    }
  }

  async getExchangeInfo() {
    const now = Date.now();
    if (!this.exchangeInfo || now - this.exchangeInfoFetchedAt > 10 * 60 * 1000) {
      this.exchangeInfo = await fetchExchangeInfo(this.fetchImpl);
      this.exchangeInfoFetchedAt = now;
    }
    return this.exchangeInfo;
  }
}

function isNetworkValidationError(error) {
  return ['fetch failed', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']
    .some((text) => String(error?.message ?? error).includes(text));
}
