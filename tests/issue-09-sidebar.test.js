import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NAV_ITEMS, getNavItems } from '../src/sidebar.js';

describe('Issue 09: 侧边栏导航', () => {
  it('NAV_ITEMS 包含首页/日历/统计/我的', () => {
    const ids = NAV_ITEMS.map(it => it.id);
    assert.ok(ids.includes('home'));
    assert.ok(ids.includes('calendar'));
    assert.ok(ids.includes('stats'));
    assert.ok(ids.includes('me'))
  });

  it('getNavItems 对当前项标记 active', () => {
    const items = getNavItems('calendar');
    const activeIds = items.filter(it => it.active).map(it => it.id);
    assert.deepStrictEqual(activeIds, ['calendar']);
  });

  it('getNavItems 不修改原 NAV_ITEMS', () => {
    const before = NAV_ITEMS.map(it => it.active || false);
    getNavItems('home');
    const after = NAV_ITEMS.map(it => it.active || false);
    assert.deepStrictEqual(after, before);
  });
});
