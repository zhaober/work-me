import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getGreetingByHour, getDailyQuote, QUOTES } from '../src/app-core.js';

describe('Issue 02: 问候语随时间变化与名言弹窗', () => {
  it('getGreetingByHour 在 8 点返回早上好', () => {
    const g = getGreetingByHour(8);
    assert.strictEqual(g.period, 'morning');
    assert.ok(g.text.includes('早上好'));
  });

  it('getGreetingByHour 在 13 点返回中午好', () => {
    const g = getGreetingByHour(13);
    assert.strictEqual(g.period, 'noon');
    assert.ok(g.text.includes('中午'));
  });

  it('getGreetingByHour 在 20 点返回晚上好', () => {
    const g = getGreetingByHour(20);
    assert.strictEqual(g.period, 'evening');
    assert.ok(g.text.includes('晚上'));
  });

  it('getDailyQuote 同一天返回同一则名言', () => {
    const q1 = getDailyQuote('2026-08-28');
    const q2 = getDailyQuote('2026-08-28');
    assert.strictEqual(q1.index, q2.index);
    assert.strictEqual(q1.text, q2.text);
  });

  it('getDailyQuote 不同日期可能返回不同名言', () => {
    const q1 = getDailyQuote('2026-08-28');
    const q2 = getDailyQuote('2026-08-29');
    assert.ok(q1.text, '名言文本非空');
    assert.ok(q2.text, '名言文本非空');
  });

  it('QUOTES 库至少包含 6 则名言', () => {
    assert.ok(QUOTES.length >= 6, '名言库不少于 6 则');
    QUOTES.forEach(q => {
      assert.ok(q.text, '每条名言有中文文本');
      assert.ok(q.author, '每条名言有作者');
    });
  });
});
