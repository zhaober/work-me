import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PRIORITY_META, getPriorityMeta, sortByPriority, collectPrioritizedRecords } from '../src/app-core.js';

describe('Issue 08: 计划优先级 UI 与归纳', () => {
  it('PRIORITY_META 包含 0-3 四个优先级', () => {
    assert.strictEqual(PRIORITY_META[1].label, '高');
    assert.strictEqual(PRIORITY_META[2].label, '中');
    assert.strictEqual(PRIORITY_META[3].label, '低');
    assert.strictEqual(PRIORITY_META[0].label, '无');
  });

  it('getPriorityMeta 对非法值回退到无', () => {
    const p = getPriorityMeta(99);
    assert.strictEqual(p.label, '无');
    assert.strictEqual(p.color, '#9AA0AB');
  });

  it('sortByPriority 按优先级高到低排序', () => {
    const arr = [{ title: 'a', priority: 0 }, { title: 'b', priority: 2 }, { title: 'c', priority: 1 }];
    const sorted = sortByPriority(arr);
    assert.deepStrictEqual(sorted.map(r => r.priority), [2, 1, 0]);
  });

  it('sortByPriority 不修改原数组', () => {
    const arr = [{ title: 'a', priority: 1 }, { title: 'b', priority: 0 }];
    sortByPriority(arr);
    assert.deepStrictEqual(arr.map(r => r.priority), [1, 0]);
  });

  it('collectPrioritizedRecords 汇总当前及后代文件夹的优先级记录', () => {
    const folders = {
      root: { name: 'root', parent: null },
      sub:  { name: 'sub', parent: 'root' }
    };
    const records = {
      r1: { folderId: 'root', title: 'A', priority: 2 },
      r2: { folderId: 'sub',  title: 'B', priority: 1 },
      r3: { folderId: 'root', title: 'C', priority: 0 },
      r4: { folderId: 'other', title: 'D', priority: 3 }
    };
    const res = collectPrioritizedRecords('root', folders, records);
    assert.strictEqual(res.length, 2);
    assert.deepStrictEqual(res.map(r => r.title), ['A', 'B']);
    assert.deepStrictEqual(res.map(r => r.priority), [2, 1]);
  });
});
