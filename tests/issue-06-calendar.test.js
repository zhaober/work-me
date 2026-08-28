import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getLunar, getSolarTerm, getFestival, matchCustomEvents, getDayMarks } from '../src/app-core.js';

describe('Issue 06: 日历节气 / 节日 / 自定义重要日子（纯逻辑）', () => {
  it('getLunar 春节 2026-02-17 为农历正月初一', () => {
    const l = getLunar(2026, 2, 17);
    assert.strictEqual(l.year, 2026); assert.strictEqual(l.month, 1); assert.strictEqual(l.day, 1); assert.strictEqual(l.isLeap, false);
  });
  it('getLunar 春节 2025-01-29 为农历正月初一', () => {
    const l = getLunar(2025, 1, 29);
    assert.strictEqual(l.month, 1); assert.strictEqual(l.day, 1);
  });
  it('getLunar 春节 2024-02-10 为农历正月初一', () => {
    const l = getLunar(2024, 2, 10);
    assert.strictEqual(l.month, 1); assert.strictEqual(l.day, 1);
  });
  it('getLunar 中秋 2026-09-25 为农历八月十五', () => {
    const l = getLunar(2026, 9, 25);
    assert.strictEqual(l.month, 8); assert.strictEqual(l.day, 15);
  });
  it('getLunar 端午 2026-06-19 为农历五月初五', () => {
    const l = getLunar(2026, 6, 19);
    assert.strictEqual(l.month, 5); assert.strictEqual(l.day, 5);
  });
  it('getLunar 元宵 2026-03-03 为农历正月十五', () => {
    const l = getLunar(2026, 3, 3);
    assert.strictEqual(l.month, 1); assert.strictEqual(l.day, 15);
  });

  it('getSolarTerm 节气日期正确', () => {
    assert.strictEqual(getSolarTerm(2026, 2, 4), '立春');
    assert.strictEqual(getSolarTerm(2026, 3, 20), '春分');
    assert.strictEqual(getSolarTerm(2026, 4, 5), '清明');
    assert.strictEqual(getSolarTerm(2026, 6, 21), '夏至');
    assert.strictEqual(getSolarTerm(2026, 10, 23), '霜降');
    assert.strictEqual(getSolarTerm(2026, 12, 22), '冬至');
  });
  it('getSolarTerm 普通日期返回 null', () => {
    assert.strictEqual(getSolarTerm(2026, 8, 27), null);
  });

  it('getFestival 公历节日', () => {
    assert.ok(getFestival(2026, 1, 1).includes('元旦'));
    assert.ok(getFestival(2026, 10, 1).includes('国庆节'));
  });
  it('getFestival 农历节日（春节 / 中秋 / 端午）', () => {
    assert.ok(getFestival(2026, 2, 17).includes('春节'));
    assert.ok(getFestival(2026, 9, 25).includes('中秋'));
    assert.ok(getFestival(2026, 6, 19).includes('端午'));
  });

  it('matchCustomEvents 按周岁月日匹配', () => {
    const events = [{ id: 'e1', name: '妈妈生日', month: 3, day: 8 }, { id: 'e2', name: '其他', month: 5, day: 1 }];
    assert.strictEqual(matchCustomEvents(events, 3, 8).length, 1);
    assert.strictEqual(matchCustomEvents(events, 1, 1).length, 0);
  });

  it('getDayMarks 汇总节气 / 节日 / 自定义', () => {
    const events = [{ id: 'e1', name: '妈妈生日', month: 2, day: 17 }];
    const mk = getDayMarks(2026, 2, 17, events);
    assert.ok(mk.festivals.includes('春节'));
    assert.strictEqual(mk.customs.length, 1);
    assert.strictEqual(mk.customs[0].name, '妈妈生日');
  });
});
