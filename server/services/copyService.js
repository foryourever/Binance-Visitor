import { normalizeFuturesSymbol } from './symbols.js';

export function validateCopySettings(input = {}) {
  const enabled = Boolean(input.enabled);
  const maxFollowAmount = toPositiveNumber(input.maxFollowAmount ?? 0, '最大跟随金额');
  const leverageLimit = toInteger(input.leverageLimit ?? 1, '杠杆上限');
  if (leverageLimit < 1 || leverageLimit > 125) {
    throw new Error('杠杆上限必须在 1 到 125 之间');
  }

  return {
    enabled,
    maxFollowAmount,
    leverageLimit,
    blacklistSymbols: normalizeBlacklist(input.blacklistSymbols),
    requireManualConfirm: input.requireManualConfirm !== false
  };
}

export async function executeCopyTrade() {
  const error = new Error('第一版不支持真实跟单下单');
  error.status = 501;
  throw error;
}

function toPositiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label}必须是非负数字`);
  }
  return number;
}

function toInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new Error(`${label}必须是整数`);
  }
  return number;
}

function normalizeBlacklist(value) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(',');
  return items
    .map((item) => String(item).trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return normalizeFuturesSymbol(item);
      } catch {
        throw new Error('黑名单币种格式不正确');
      }
    });
}
