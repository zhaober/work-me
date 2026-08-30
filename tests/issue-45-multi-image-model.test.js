import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMAGES_PER_RECORD, normalizeImageIds, recordImageIds, hasImage,
  recordToRow, rowToRecord, noteListRow, splitNoteRow, mergeNoteRows
} from '../src/app-core.js';

/* ============================================================
   Issue-45：同一计划支持添加多张图片（数据层）
   记录结构由 image_id 单值升级为 image_ids 数组，
   要求：旧库 / 旧导出包（只有 image_id）读出来不能丢图。
   ============================================================ */

test('MAX_IMAGES_PER_RECORD 为可用的正整数上限', () => {
  assert.ok(Number.isInteger(MAX_IMAGES_PER_RECORD));
  assert.ok(MAX_IMAGES_PER_RECORD > 1);
});

test('normalizeImageIds：数组原样保留顺序', () => {
  assert.deepEqual(normalizeImageIds(['img_a', 'img_b', 'img_c']), ['img_a', 'img_b', 'img_c']);
});

test('normalizeImageIds：单个字符串包装为数组（旧结构兼容）', () => {
  assert.deepEqual(normalizeImageIds('img_1'), ['img_1']);
});

test('normalizeImageIds：过滤空串、null、undefined 与非字符串', () => {
  assert.deepEqual(normalizeImageIds(['img_a', '', null, undefined, 'img_b', 123, {}]), ['img_a', 'img_b']);
});

test('normalizeImageIds：重复 id 去重，保留首次出现位置', () => {
  assert.deepEqual(normalizeImageIds(['img_a', 'img_b', 'img_a']), ['img_a', 'img_b']);
});

test('normalizeImageIds：超出上限时截断到 MAX_IMAGES_PER_RECORD', () => {
  const many = [];
  for (let i = 0; i < MAX_IMAGES_PER_RECORD + 5; i++) many.push('img_' + i);
  const out = normalizeImageIds(many);
  assert.equal(out.length, MAX_IMAGES_PER_RECORD);
  assert.equal(out[0], 'img_0');
});

test('normalizeImageIds：null / undefined / 非法输入返回空数组', () => {
  assert.deepEqual(normalizeImageIds(null), []);
  assert.deepEqual(normalizeImageIds(undefined), []);
  assert.deepEqual(normalizeImageIds(0), []);
  assert.deepEqual(normalizeImageIds({}), []);
});

test('recordImageIds：优先取 image_ids 数组', () => {
  assert.deepEqual(recordImageIds({ image_ids: ['a', 'b'], image_id: 'old' }), ['a', 'b']);
});

test('recordImageIds：无 image_ids 时回落旧 image_id 单值', () => {
  assert.deepEqual(recordImageIds({ image_id: 'old_1' }), ['old_1']);
});

test('recordImageIds：两者都没有时返回空数组', () => {
  assert.deepEqual(recordImageIds({ title: '无图' }), []);
  assert.deepEqual(recordImageIds(null), []);
});

/* ---------- hasImage：多图与旧单值都要认 ---------- */

test('hasImage：images 数组含有效 URL 时为 true', () => {
  assert.equal(hasImage({ images: ['blob:http://x/1'] }), true);
});

test('hasImage：image_ids 数组非空时为 true', () => {
  assert.equal(hasImage({ image_ids: ['img_1', 'img_2'] }), true);
});

test('hasImage：兼容旧的单张 image 字段', () => {
  assert.equal(hasImage({ image: 'data:image/png;base64,AAAA' }), true);
});

test('hasImage：空数组与空值一律为 false', () => {
  assert.equal(hasImage({ images: [] }), false);
  assert.equal(hasImage({ images: [''] }), false);
  assert.equal(hasImage({ image_ids: [] }), false);
  assert.equal(hasImage({ image: '' }), false);
  assert.equal(hasImage({ image: null }), false);
  assert.equal(hasImage({ title: '无图' }), false);
  assert.equal(hasImage(null), false);
});

/* ---------- 行映射：多图进库 / 出库 ---------- */

test('recordToRow：多图按序落为 image_ids 数组', () => {
  const row = recordToRow({ id: 'r1', image_ids: ['img_a', 'img_b', 'img_c'] }, 1000);
  assert.deepEqual(row.image_ids, ['img_a', 'img_b', 'img_c']);
  assert.equal(row.image_id, undefined, '不再写入旧的 image_id 单值字段');
});

test('recordToRow：旧结构 image_id 单值自动收敛为数组', () => {
  const row = recordToRow({ id: 'r1', image_id: 'img_old' }, 1000);
  assert.deepEqual(row.image_ids, ['img_old']);
});

test('rowToRecord：多图行完整还原，images 初始化为空数组', () => {
  const row = recordToRow({ id: 'r1', image_ids: ['img_a', 'img_b'] }, 1000);
  const rec = rowToRecord(row);
  assert.deepEqual(rec.image_ids, ['img_a', 'img_b']);
  assert.deepEqual(rec.images, []);
});

test('rowToRecord：旧库单值行读出为单元素数组，不丢图', () => {
  const rec = rowToRecord({ id: 'r1', image_id: 'img_old', content_compressed: null, style_data: null });
  assert.deepEqual(rec.image_ids, ['img_old']);
});

test('splitNoteRow / mergeNoteRows 往返后图片 id 不丢失', () => {
  const row = recordToRow({ id: 'r1', image_ids: ['img_a', 'img_b'] }, 1000);
  const { meta, content } = splitNoteRow(row);
  assert.deepEqual(meta.image_ids, ['img_a', 'img_b']);
  const merged = mergeNoteRows(meta, content);
  assert.deepEqual(merged.image_ids, ['img_a', 'img_b']);
  assert.deepEqual(rowToRecord(merged).image_ids, ['img_a', 'img_b']);
});

test('noteListRow：列表轻量行携带 image_ids 但不带正文', () => {
  const list = noteListRow(recordToRow({ id: 'r1', image_ids: ['img_a', 'img_b'] }, 1000));
  assert.deepEqual(list.image_ids, ['img_a', 'img_b']);
  assert.equal(list.content_compressed, undefined);
  assert.equal(list.style_data, undefined);
});
