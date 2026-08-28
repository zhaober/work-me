import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getTodayStr, formatDateHeader, parseDate } from '../src/app-core.js';

describe('Issue 01: 日期动态化与计划绑定日期', () => {
  it('getTodayStr 返回今天的日期字符串', () => {
    const today = getTodayStr();
    const expected = new Date().toISOString().slice(0, 10);
    assert.strictEqual(today, expected);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(today), '格式应为 YYYY-MM-DD');
  });

  it('formatDateHeader 能正确格式化 2026-08-27', () => {
    const text = formatDateHeader('2026-08-27');
    assert.strictEqual(text, '周四 · 8月27日');
  });

  it('formatDateHeader 能正确格式化跨年日期', () => {
    const text = formatDateHeader('2025-01-01');
    assert.ok(text.includes('1月1日'), '应包含 1月1日');
  });

  it('parseDate 解析后年月日正确', () => {
    const d = parseDate('2026-08-27');
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 7);
    assert.strictEqual(d.getDate(), 27);
  });
});
