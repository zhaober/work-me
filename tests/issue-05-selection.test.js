import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildFolderContents,
  collectDescendantFolderIds,
  deleteSelectedItems,
  clearFolderContents
} from '../src/app-core.js';

const folders = {
  A: { name: 'A', parent: null },
  B: { name: 'B', parent: 'A' },
  C: { name: 'C', parent: 'A' },
  D: { name: 'D', parent: 'B' }
};
const records = {
  r1: { type: 'plan', folderId: 'A', title: 'A 的计划' },
  r2: { type: 'plan', folderId: 'B', title: 'B 的计划' },
  r3: { type: 'plan', folderId: 'D', title: 'D 的计划' },
  r4: { type: 'plan', folderId: 'C', title: 'C 的计划' }
};

describe('Issue 05: 文件夹选择性删除与一键清空（纯逻辑）', () => {
  it('buildFolderContents 返回子文件夹与记录', () => {
    const list = buildFolderContents('A', folders, records);
    const folders_in = list.filter(x => x.type === 'folder').map(x => x.id);
    const records_in = list.filter(x => x.type === 'record').map(x => x.id);
    assert.deepStrictEqual(folders_in.sort(), ['B', 'C']);
    assert.deepStrictEqual(records_in, ['r1']);
  });

  it('collectDescendantFolderIds 收集自身及全部后代', () => {
    const ids = collectDescendantFolderIds('A', folders);
    assert.strictEqual(ids.length, 4);
    assert.deepStrictEqual(ids.sort(), ['A', 'B', 'C', 'D']);
  });

  it('deleteSelectedItems 删除文件夹会递归删除子文件夹与记录', () => {
    const res = deleteSelectedItems(['A'], folders, records);
    assert.deepStrictEqual(Object.keys(res.folders), []);
    assert.deepStrictEqual(Object.keys(res.records), []);
  });

  it('deleteSelectedItems 删除中间文件夹只影响其子树', () => {
    const res = deleteSelectedItems(['B'], folders, records);
    assert.deepStrictEqual(Object.keys(res.folders).sort(), ['A', 'C']);
    assert.deepStrictEqual(Object.keys(res.records).sort(), ['r1', 'r4']);
  });

  it('deleteSelectedItems 删除单条记录不影响文件夹', () => {
    const res = deleteSelectedItems(['r1'], folders, records);
    assert.deepStrictEqual(Object.keys(res.folders).sort(), ['A', 'B', 'C', 'D']);
    assert.deepStrictEqual(Object.keys(res.records).sort(), ['r2', 'r3', 'r4']);
  });

  it('deleteSelectedItems 不修改入参原对象', () => {
    const before = JSON.stringify({ folders, records });
    deleteSelectedItems(['A'], folders, records);
    assert.strictEqual(JSON.stringify({ folders, records }), before);
  });

  it('clearFolderContents 清空子文件夹与记录但保留自身', () => {
    const res = clearFolderContents('A', folders, records);
    assert.deepStrictEqual(Object.keys(res.folders), ['A']);
    assert.deepStrictEqual(Object.keys(res.records), []);
  });

  it('clearFolderContents 对叶子文件夹只删其下记录', () => {
    const res = clearFolderContents('C', folders, records);
    assert.deepStrictEqual(Object.keys(res.folders).sort(), ['A', 'B', 'C', 'D']);
    assert.deepStrictEqual(Object.keys(res.records).sort(), ['r1', 'r2', 'r3']);
  });
});
