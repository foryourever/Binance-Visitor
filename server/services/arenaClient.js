const DEFAULT_ARENA_BASE_URL = 'https://www.arenafi.org/trader/';
const DEFAULT_HANDLE_MAP = {
  '4872767084124315648': 'ETH 阿辰'
};

export class ArenaTraderClient {
  constructor({
    fetchImpl = fetch,
    baseUrl = process.env.ARENA_TRADER_BASE_URL || DEFAULT_ARENA_BASE_URL,
    handleMap = parseHandleMap(process.env.ARENA_LEADER_HANDLE_MAP) || DEFAULT_HANDLE_MAP
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.handleMap = handleMap;
  }

  async fetchSnapshot(leaderId) {
    const handle = this.resolveHandle(leaderId);
    const sourceUrl = new URL(encodeURIComponent(handle), this.baseUrl).href;
    const response = await this.fetchImpl(sourceUrl, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    if (!response.ok) {
      throw new Error(`Arena 聚合数据请求失败: ${response.status}`);
    }

    const parsed = parseArenaTraderData(await response.text());
    return {
      source: 'arena',
      sourceUrl,
      profile: {
        ...parsed.profile,
        displayName: parsed.profile.handle,
        source: 'arena'
      },
      metrics: parsed.metrics,
      portfolio: parsed.portfolio,
      trades: parsed.portfolio.map((position) => ({
        leaderId,
        symbol: position.symbol,
        side: position.side,
        eventTime: Date.now(),
        price: position.price,
        qty: position.value || position.invested || 0,
        action: 'ARENA_POSITION',
        raw: position
      }))
    };
  }

  resolveHandle(leaderId) {
    return this.handleMap[leaderId] || leaderId;
  }
}

export function parseArenaTraderData(html) {
  const objectText = extractEscapedObject(html, 'serverTraderData');
  if (!objectText) {
    throw new Error('Arena 页面未找到交易员数据');
  }

  const data = JSON.parse(unescapeFlightJson(objectText));
  const profile = data.profile || {};
  const performance = data.performance || {};
  const portfolio = Array.isArray(data.portfolio) ? data.portfolio : [];

  return {
    profile: {
      handle: profile.handle,
      id: profile.id,
      followers: Number(profile.followers ?? 0),
      copiers: Number(profile.copiers ?? 0),
      avatarUrl: profile.avatar_url,
      source: profile.source,
      marketType: profile.market_type,
      profileUrl: profile.profile_url,
      bio: profile.bio
    },
    metrics: {
      roi90d: nullableNumber(performance.roi_90d),
      pnl: nullableNumber(performance.pnl),
      winRate: nullableNumber(performance.win_rate),
      maxDrawdown: nullableNumber(performance.max_drawdown),
      arenaScore: nullableNumber(performance.arena_score),
      sharpeRatio: nullableNumber(performance.sharpe_ratio),
      winningPositions: nullableNumber(performance.winning_positions),
      totalPositions: nullableNumber(performance.total_positions)
    },
    portfolio: portfolio.map((item) => ({
      symbol: item.market,
      side: String(item.direction || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
      invested: Number(item.invested ?? 0),
      pnl: Number(item.pnl ?? 0),
      value: Number(item.value ?? 0),
      price: Number(item.price ?? 0)
    })).filter((item) => item.symbol)
  };
}

function extractEscapedObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const start = text.indexOf('{', markerIndex + marker.length);
  if (start < 0) {
    return null;
  }

  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

function unescapeFlightJson(value) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, '&')
    .replace(/\\n/g, '\n')
    .replace(/\\\//g, '/');
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseHandleMap(value) {
  if (!value) {
    return null;
  }
  return Object.fromEntries(String(value).split(',').map((entry) => {
    const [id, handle] = entry.split('=');
    return [id?.trim(), handle?.trim()];
  }).filter(([id, handle]) => id && handle));
}
