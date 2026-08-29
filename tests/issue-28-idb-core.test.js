// Issue-28: 存储内核从 localStorage 迁移到 IndexedDB —— 第一步：数据编解码层。
// 规格要点：
//   1) 业务数据不再走 localStorage（5MB 上限 + 只能存字符串）
//   2) 正文用 lz-string 压成 Uint8Array（content_compressed）
//   3) 小字段（标签）用 TextEncoder 存 Uint8Array（style_data），不浪费压缩开销
//   4) 列表页只取轻量字段，不把 content_compressed 拉进内存
// 本文件只验证可在 Node 下运行的纯函数；IndexedDB  plumbing 由 issue-29 的源码断言覆盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDB_NAME,
  IDB_VERSION,
  STORES,
  NOTE_INDEXES,
  LEGACY_LS_KEY,
  encodeNoteContent,
  decodeNoteContent,
  encodeStyleData,
  decodeStyleData,
  recordToRow,
  rowToRecord,
  noteListRow,
  noteRowBytes,
} from '../src/app-core.js';

const sampleRecord = () => ({
  id: 'r1',
  type: 'plan',
  folderId: 'work',
  title: '完成 Q3 新品上线方案',
  date: '2026-08-27',
  time: '09:20',
  reminder: '18:00',
  tags: ['重要', '跟进'],
  priority: 1,
  image_id: 'img_1',
  checklist: [
    { t: '拉齐研发排期', c: true },
    { t: '确认灰度方案', c: false },
  ],
  body: '上午：与研发对齐上线排期，确认灰度方案与时间窗。',
});

test('存储常量：库名/仓库名/索引名稳定，且旧 localStorage 键名可追溯', () => {
  assert.equal(typeof IDB_NAME, 'string');
  assert.ok(IDB_NAME.length > 0, 'IndexedDB 库名不能为空');
  assert.equal(IDB_VERSION, 1);
  assert.equal(STORES.notes, 'notes');
  assert.equal(STORES.images, 'note_images');
  assert.equal(STORES.meta, 'meta');
  assert.ok(NOTE_INDEXES.includes('by_update'), '需有 update_time 索引供列表排序');
  // 迁移用：必须与 localStorage 时代实际使用的键一致（DB_VERSION=1）
  assert.equal(LEGACY_LS_KEY, 'work-memo-db-v1');
});

test('正文压缩往返：中文 + 清单结构完整还原', () => {
  const body = '上午：与研发对齐上线排期，确认灰度方案与时间窗。';
  const checklist = [{ t: '拉齐研发排期', c: true }, { t: '确认灰度方案', c: false }];
  const u8 = encodeNoteContent(body, checklist);
  assert.ok(u8 instanceof Uint8Array, '压缩结果必须是 Uint8Array（可直接存 IndexedDB）');

  const back = decodeNoteContent(u8);
  assert.equal(back.body, body);
  assert.deepEqual(back.checklist, checklist);
});

test('压缩确实生效：重复长文本显著小于原始 UTF-8 字节', () => {
  const body = '这是一段重复的中文正文内容，用于验证压缩率。'.repeat(60);
  const u8 = encodeNoteContent(body, []);
  const rawBytes = Buffer.byteLength(body, 'utf8');
  assert.ok(u8.byteLength < rawBytes * 0.5,
    `压缩后应小于原始的一半：compressed=${u8.byteLength} raw=${rawBytes}`);
  assert.equal(decodeNoteContent(u8).body, body, '压缩后必须能无损还原');
});

test('空内容/异常输入安全回落，不抛错', () => {
  assert.deepEqual(decodeNoteContent(null), { body: '', checklist: [] });
  assert.deepEqual(decodeNoteContent(new Uint8Array(0)), { body: '', checklist: [] });
  // 脏数据（非 lz-string 格式）不得抛异常，保证脏行不会拖垮整个列表
  assert.deepEqual(decodeNoteContent(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
    { body: '', checklist: [] });
  // 非字符串 body 也能编码
  assert.equal(decodeNoteContent(encodeNoteContent(null, null)).body, '');
});

test('style_data 用 TextEncoder 存小字段，往返一致', () => {
  const u8 = encodeStyleData({ tags: ['重要', '跟进'] });
  assert.ok(u8 instanceof Uint8Array);
  assert.deepEqual(decodeStyleData(u8), { tags: ['重要', '跟进'] });
  assert.deepEqual(decodeStyleData(null), {});
  assert.deepEqual(decodeStyleData(new Uint8Array([0xff, 0xfe])), {}, '脏数据回落为空对象');
});

test('recordToRow：正文/清单进压缩字段，标签进样式字段，图片只留外键', () => {
  const row = recordToRow(sampleRecord(), 1_800_000_000_000);
  assert.equal(row.id, 'r1');
  assert.equal(row.title, '完成 Q3 新品上线方案');
  assert.equal(row.folderId, 'work');
  assert.equal(row.priority, 1);
  assert.equal(row.image_id, 'img_1');
  assert.equal(row.update_time, 1_800_000_000_000, '未带 update_time 时用传入时间戳');

  assert.ok(row.content_compressed instanceof Uint8Array);
  assert.ok(row.style_data instanceof Uint8Array);
  // 明文不得出现在行级字段里（否则等于没压缩）
  assert.equal(row.body, undefined);
  assert.equal(row.checklist, undefined);
  assert.equal(row.tags, undefined);

  const content = decodeNoteContent(row.content_compressed);
  assert.equal(content.body, '上午：与研发对齐上线排期，确认灰度方案与时间窗。');
  assert.equal(content.checklist.length, 2);
  assert.deepEqual(decodeStyleData(row.style_data).tags, ['重要', '跟进']);
});

test('recordToRow：缺失字段走默认值，不产生 undefined 索引键', () => {
  const row = recordToRow({ id: 'x' }, 1_000);
  assert.equal(row.type, 'plan');
  assert.equal(row.title, '');
  assert.equal(row.date, '');
  assert.equal(row.time, '');
  assert.equal(row.reminder, null);
  assert.equal(row.priority, 0);
  assert.equal(row.image_id, null);
  assert.deepEqual(decodeNoteContent(row.content_compressed), { body: '', checklist: [] });
  assert.deepEqual(decodeStyleData(row.style_data), { tags: [] });
});

test('rowToRecord：完整还原为运行时记录对象', () => {
  const row = recordToRow(sampleRecord(), 1_800_000_000_000);
  const rec = rowToRecord(row);
  assert.equal(rec.id, 'r1');
  assert.equal(rec.type, 'plan');
  assert.equal(rec.folderId, 'work');
  assert.equal(rec.title, '完成 Q3 新品上线方案');
  assert.equal(rec.date, '2026-08-27');
  assert.equal(rec.time, '09:20');
  assert.equal(rec.reminder, '18:00');
  assert.deepEqual(rec.tags, ['重要', '跟进']);
  assert.equal(rec.priority, 1);
  assert.equal(rec.image_id, 'img_1');
  assert.equal(rec.body, '上午：与研发对齐上线排期，确认灰度方案与时间窗。');
  assert.equal(rec.checklist.length, 2);
  assert.equal(rec.checklist[0].t, '拉齐研发排期');
  assert.equal(rec.checklist[0].c, true);
  assert.equal(rec.update_time, 1_800_000_000_000);
  // image 由运行时按 image_id 填充为 blob URL，落库时不存
  assert.equal(rec.image, null);
});

test('rowToRecord(null) 返回 null，调用方可安全判空', () => {
  assert.equal(rowToRecord(null), null);
  assert.equal(rowToRecord(undefined), null);
});

test('noteListRow：列表页只取轻量字段，不带正文与样式数据', () => {
  const list = noteListRow(recordToRow(sampleRecord(), 1_800_000_000_000));
  assert.equal(list.id, 'r1');
  assert.equal(list.title, '完成 Q3 新品上线方案');
  assert.equal(list.update_time, 1_800_000_000_000);
  assert.equal(list.image_id, 'img_1');

  assert.equal(list.content_compressed, undefined, '列表不得加载压缩正文');
  assert.equal(list.style_data, undefined, '列表不得加载样式数据');
  assert.equal(list.body, undefined);
  assert.equal(list.checklist, undefined);
  // 反向断言：完整行里这些字段确实存在，裁剪是真的生效
  assert.ok('content_compressed' in recordToRow(sampleRecord(), 1));
});

test('noteRowBytes：按压缩字段 + 样式字段 + 标题估算占用', () => {
  const row = recordToRow(sampleRecord(), 1);
  const bytes = noteRowBytes(row);
  assert.equal(bytes,
    row.content_compressed.byteLength + row.style_data.byteLength + row.title.length * 3);
  assert.ok(bytes > 0);
  assert.equal(noteRowBytes(null), 0);
});
