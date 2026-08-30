import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairRecordId } from '../src/app-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ============================================================
   Issue-44：用户保存时报错
   "Failed to execute 'put' on 'IDBObjectStore': Evaluating the
    object store's key path yielded a value that is not a valid key."
   根因：DB.records 中存在 id 为 null / undefined / 非字符串的记录，
   IndexedDB notes/contents 表的 keyPath 为 'id'，null 不是合法 key。
   ============================================================ */

test('repairRecordId：合法 id 原样返回', () => {
  const r = { id: 'r123', title: '测试' };
  assert.strictEqual(repairRecordId(r, 'fallback'), r);
  assert.strictEqual(r.id, 'r123');
});

test('repairRecordId：id 缺失时用 fallbackKey 补齐', () => {
  const r = { title: '无 id' };
  const out = repairRecordId(r, 'r999');
  assert.strictEqual(out, r);
  assert.strictEqual(r.id, 'r999');
});

test('repairRecordId：id 为 null 时用 fallbackKey 补齐', () => {
  const r = { id: null, title: 'null id' };
  repairRecordId(r, 'r888');
  assert.strictEqual(r.id, 'r888');
});

test('repairRecordId：id 为空字符串时生成新 id', () => {
  const r = { id: '', title: '空 id' };
  repairRecordId(r, '');
  assert.ok(typeof r.id === 'string' && r.id.startsWith('r'), '应生成 r 开头的新 id');
});

test('repairRecordId：record 不是对象时返回 null（调用方应删除）', () => {
  assert.strictEqual(repairRecordId(null, 'k'), null);
  assert.strictEqual(repairRecordId(undefined, 'k'), null);
  assert.strictEqual(repairRecordId('string record', 'k'), null);
});

test('persistToIdb 在写入前调用 repairRecordId 自检非法 id', () => {
  assert.ok(/repairRecordId\(DB\.records\[k\], k\)/.test(html), 'persistToIdb 应逐条修复 DB.records');
  assert.ok(/if\(r === null\)\{ delete DB\.records\[k\]/.test(html), '无法修复的记录应从内存删除');
  assert.ok(/else if\(r\.id !== k\)\{ DB\.records\[r\.id\] = r; delete DB\.records\[k\]/.test(html), 'id 变化时应重新 key');
});

test('编辑器提醒/日期行已套 editor-meta-card 卡片容器', () => {
  assert.ok(/class="editor-meta-card"/.test(html), '应存在 editor-meta-card 样式类');
  const planSeg = html.slice(html.indexOf("if(type==='plan')"), html.indexOf("if(type==='plan')") + 600);
  assert.ok(/<div class="editor-meta-card">/.test(planSeg), '计划编辑器的提醒/日期应被卡片包裹');
});
