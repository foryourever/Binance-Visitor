import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCopySettings, executeCopyTrade } from '../server/services/copyService.js';

test('validateCopySettings normalizes safe copy-trading draft settings', () => {
  assert.deepEqual(validateCopySettings({
    enabled: true,
    maxFollowAmount: '100',
    leverageLimit: '5',
    blacklistSymbols: 'BTCUSDT, ethusdt ',
    requireManualConfirm: false
  }), {
    enabled: true,
    maxFollowAmount: 100,
    leverageLimit: 5,
    blacklistSymbols: ['BTCUSDT', 'ETHUSDT'],
    requireManualConfirm: false
  });
});

test('validateCopySettings rejects unsafe or malformed drafts', () => {
  assert.throws(() => validateCopySettings({ maxFollowAmount: -1 }), /最大跟随金额/);
  assert.throws(() => validateCopySettings({ leverageLimit: 126 }), /杠杆上限/);
  assert.throws(() => validateCopySettings({ blacklistSymbols: ['BTC/USDT'] }), /黑名单币种/);
});

test('executeCopyTrade never places real orders in monitoring MVP', async () => {
  await assert.rejects(() => executeCopyTrade({}), /第一版不支持真实跟单下单/);
});
