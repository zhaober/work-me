import { describe, it } from 'node:test';
import assert from 'node:assert';
import { deleteChecklistItem } from '../src/app-core.js';

describe('Issue 03: 删除单个待办清单项', () => {
  it('deleteChecklistItem 删除中间项', () => {
    const list = [{ t: 'A', c: false }, { t: 'B', c: true }, { t: 'C', c: false }];
    const result = deleteChecklistItem(list, 1);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result, [{ t: 'A', c: false }, { t: 'C', c: false }]);
  });

  it('deleteChecklistItem 删除第一项', () => {
    const list = [{ t: 'A', c: false }, { t: 'B', c: true }];
    const result = deleteChecklistItem(list, 0);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].t, 'B');
  });

  it('deleteChecklistItem 删除最后一项', () => {
    const list = [{ t: 'A', c: false }, { t: 'B', c: true }];
    const result = deleteChecklistItem(list, 1);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].t, 'A');
  });

  it('deleteChecklistItem 不修改原数组', () => {
    const list = [{ t: 'A', c: false }, { t: 'B', c: true }];
    deleteChecklistItem(list, 0);
    assert.strictEqual(list.length, 2);
  });
});
