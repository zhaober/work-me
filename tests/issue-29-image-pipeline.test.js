// Issue-29: 图片管线 —— WebP 压缩 + 缩略图 + SHA-256 全局去重
// 规格要点：
//   1) 图片以 WebP Blob 直接存 IndexedDB，禁止 Base64 / toDataURL（体积 +33% 且占内存）
//   2) 大图长边 1080（质量 0.75），缩略图 200×200 居中裁剪（质量 0.65）
//   3) 入库前按 SHA-256 去重，重复图片复用旧 id，不占第二份空间
//   4) 封装 class NoteDB（putNote / getNote / deleteNote / saveImage）
// 浏览器 API（canvas / IndexedDB）无法在 Node 下运行，故：
//   纯逻辑走函数级断言，管线接线走源码断言。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  STORES,
  IMAGE_PIPELINE,
  computeThumbRect,
  toHex,
  fallbackHashBytes,
  dedupeDecision,
  buildImageRow,
  makeImageId,
  splitNoteRow,
  mergeNoteRows,
} from '../src/app-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const dbSrc = readFileSync(resolve(here, '../src/note-db.js'), 'utf8');

/* ---------------- 纯函数：缩略图裁剪 ---------------- */

test('缩略图居中裁剪：横向图取高度为正方形边长，左右居中', () => {
  const r = computeThumbRect(1600, 900);
  assert.equal(r.side, 900, '短边为裁剪边长');
  assert.equal(r.sw, 900);
  assert.equal(r.sh, 900);
  assert.equal(r.sx, 350, '(1600-900)/2 = 350');
  assert.equal(r.sy, 0);
});

test('缩略图居中裁剪：纵向图取宽度为正方形边长，上下居中', () => {
  const r = computeThumbRect(900, 1600);
  assert.equal(r.side, 900);
  assert.equal(r.sx, 0);
  assert.equal(r.sy, 350, '(1600-900)/2 = 350');
});

test('缩略图裁剪：正方形图整幅保留；非法尺寸安全回落', () => {
  const sq = computeThumbRect(800, 800);
  assert.deepEqual([sq.sx, sq.sy, sq.sw, sq.sh], [0, 0, 800, 800]);
  assert.equal(computeThumbRect(0, 0).side, 0);
  assert.equal(computeThumbRect(null, undefined).side, 0);
});

/* ---------------- 纯函数：哈希与去重 ---------------- */

test('toHex：字节数组转十六进制，两位补齐', () => {
  assert.equal(toHex(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff');
  assert.equal(toHex(null), '');
  assert.equal(toHex(new Uint8Array(0)), '');
});

test('fallbackHashBytes：确定性、可区分、长度固定 16 字节', () => {
  const a = new Uint8Array([1, 2, 3, 4, 5]);
  const b = new Uint8Array([1, 2, 3, 4, 6]);
  const ha = fallbackHashBytes(a);
  const hb = fallbackHashBytes(b);
  assert.equal(ha.length, 16, '4 组 FNV 各 4 字节');
  assert.equal(toHex(ha), toHex(fallbackHashBytes(a)), '同样输入必须同样输出');
  assert.notEqual(toHex(ha), toHex(hb), '不同输入应产生不同指纹');
  assert.equal(fallbackHashBytes(new Uint8Array(0)).length, 16, '空输入也要有输出');
});

test('dedupeDecision：命中哈希复用旧 id，未命中才新存', () => {
  const hit = dedupeDecision({ id: 'img_existing', w: 200 });
  assert.equal(hit.action, 'reuse');
  assert.equal(hit.imageId, 'img_existing');
  assert.equal(hit.reason, 'hash_exists');

  const miss = dedupeDecision(null);
  assert.equal(miss.action, 'store');
  assert.equal(miss.imageId, null);
  assert.equal(miss.reason, 'new_hash');

  // 有对象但缺 id，视为未命中（防御脏数据）
  assert.equal(dedupeDecision({ w: 1 }).action, 'store');
});

test('buildImageRow：组装图片行，bytes 为大图+缩略图之和', () => {
  const full = new Blob([new Uint8Array(1000)]);
  const thumb = new Blob([new Uint8Array(64)]);
  const row = buildImageRow({
    id: 'img_1', hash: 'abc123', fullBlob: full, thumbBlob: thumb,
    width: 1080, height: 810, created: 1234,
  }, 'r1');
  assert.equal(row.id, 'img_1');
  assert.equal(row.note_id, 'r1');
  assert.equal(row.hash_sha, 'abc123');
  assert.equal(row.blob_full, full);
  assert.equal(row.blob_thumb, thumb);
  assert.equal(row.w, 1080);
  assert.equal(row.h, 810);
  assert.equal(row.bytes, 1064);
  assert.equal(row.created, 1234);
});

test('buildImageRow：缺 Blob 时 bytes 不报错', () => {
  const row = buildImageRow({ id: 'img_2', hash: 'x' }, 'r2');
  assert.equal(row.bytes, 0);
  assert.equal(row.blob_full, null);
});

test('makeImageId：带前缀，且同时间戳下带随机段避免冲突', () => {
  const a = makeImageId(1_800_000_000_000, 0.111111);
  const b = makeImageId(1_800_000_000_000, 0.999999);
  assert.ok(a.startsWith('img_'), 'id 需带 img_ 前缀便于识别');
  assert.notEqual(a, b, '同一毫秒内插入多张图不应撞 id');
  assert.ok(makeImageId(null).startsWith('img_'), '无时间戳时用当前时间');
  assert.equal(makeImageId(1_800_000_000_000, 0.111111), a, '同参数可重现');
});

/* ---------------- 纯函数：分表拆合 ---------------- */

test('splitNoteRow / mergeNoteRows：元数据与正文可无损拆分与合并', () => {
  const row = {
    id: 'r1', type: 'plan', folderId: 'work', title: '标题', date: '2026-08-29',
    time: '09:00', reminder: '18:00', priority: 1, image_id: 'img_1', update_time: 99,
    content_compressed: new Uint8Array([1, 2, 3]), style_data: new Uint8Array([4, 5]),
  };
  const parts = splitNoteRow(row);
  // 元数据行不得携带正文（否则列表查询会把正文读进内存）
  assert.equal(parts.meta.content_compressed, undefined);
  assert.equal(parts.meta.style_data, undefined);
  assert.equal(parts.meta.id, 'r1');
  assert.equal(parts.meta.update_time, 99);
  assert.equal(parts.content.id, 'r1');
  assert.deepEqual(Array.from(parts.content.content_compressed), [1, 2, 3]);

  const merged = mergeNoteRows(parts.meta, parts.content);
  assert.equal(merged.id, 'r1');
  assert.equal(merged.title, '标题');
  assert.deepEqual(Array.from(merged.content_compressed), [1, 2, 3]);
  assert.deepEqual(Array.from(merged.style_data), [4, 5]);

  assert.equal(mergeNoteRows(null, null), null);
  // 正文缺失时不得抛错，回落为 null（由 rowToRecord 安全处理）
  assert.equal(mergeNoteRows(parts.meta, null).content_compressed, null);
});

test('STORES：正文独立成表，列表查询才能不加载正文', () => {
  assert.equal(STORES.notes, 'notes');
  assert.equal(STORES.contents, 'note_contents');
  assert.equal(STORES.images, 'note_images');
  assert.equal(STORES.meta, 'meta');
});

test('IMAGE_PIPELINE：压缩参数符合规格（1080 / 0.75、200 / 0.65）', () => {
  assert.equal(IMAGE_PIPELINE.fullMaxDim, 1080);
  assert.equal(IMAGE_PIPELINE.fullQuality, 0.75);
  assert.equal(IMAGE_PIPELINE.fullType, 'image/webp');
  assert.equal(IMAGE_PIPELINE.thumbSize, 200);
  assert.equal(IMAGE_PIPELINE.thumbQuality, 0.65);
  assert.equal(IMAGE_PIPELINE.thumbType, 'image/webp');
  assert.equal(IMAGE_PIPELINE.hashAlgo, 'SHA-256');
  assert.ok(IMAGE_PIPELINE.fallbackType, '需有回落格式，避免不支持 WebP 时静默降级成 PNG');
});

/* ---------------- 源码接线断言：管线不能走偏 ---------------- */

test('源码：导出图片一律用 toBlob，不得用 toDataURL 产出存储用图', () => {
  assert.match(dbSrc, /cv\.toBlob\(/, '必须用 toBlob 产出 Blob');
  const dataUrlCount = (dbSrc.match(/toDataURL\(/g) || []).length;
  assert.equal(dataUrlCount, 1, 'toDataURL 只允许出现一次（1×1 画布的格式探测）');
  assert.match(dbSrc, /cv\.width\s*=\s*1;\s*cv\.height\s*=\s*1/, '该次 toDataURL 必须是 1×1 探测');
});

test('源码：大图走 WebP + createImageBitmap，缩略图独立离屏画布', () => {
  assert.match(dbSrc, /createImageBitmap/, '大图优先用 createImageBitmap 解码');
  assert.match(dbSrc, /supportsImageType\(IMAGE_PIPELINE\.fullType\)/, '需探测 WebP 支持再决定格式');
  assert.match(dbSrc, /computeResize\(sw,\s*sh,\s*IMAGE_PIPELINE\.fullMaxDim\)/, '大图长边 1080');
  assert.match(dbSrc, /computeThumbRect\(sw,\s*sh\)/, '缩略图裁剪区按源图算');
  assert.match(dbSrc, /IMAGE_PIPELINE\.thumbSize,\s*IMAGE_PIPELINE\.thumbSize/, '缩略图输出 200×200');
});

test('源码：去重走 crypto.subtle SHA-256，并有非安全上下文兜底', () => {
  assert.match(dbSrc, /crypto\.subtle\.digest\(IMAGE_PIPELINE\.hashAlgo/, '用 SHA-256 计算哈希');
  assert.match(dbSrc, /fallbackHashBytes/, 'crypto.subtle 不可用时兜底');
  assert.match(dbSrc, /findImageByHash/, '入库前先查重');
  assert.match(dbSrc, /dedupeDecision/, '按查重结果决定存或复用');
});

test('源码：hash_sha 建唯一索引，note_id 建索引', () => {
  assert.match(dbSrc, /createIndex\('by_hash',\s*'hash_sha',\s*\{\s*unique:\s*true\s*\}\)/,
    '唯一索引是去重的数据库层保障');
  assert.match(dbSrc, /createIndex\('by_note',\s*'note_id'\)/, '删笔记时按 note_id 找图');
});

test('源码：NoteDB 提供规格要求的四个方法，且删笔记先删图', () => {
  assert.match(dbSrc, /export class NoteDB/);
  assert.match(dbSrc, /async putNote\(/);
  assert.match(dbSrc, /async getNote\(/);
  assert.match(dbSrc, /async deleteNote\(/);
  assert.match(dbSrc, /async saveImage\(/);
  // 删除顺序：先 deleteImagesOf，再删正文与元数据，避免留下无法定位的孤儿 Blob
  const del = dbSrc.slice(dbSrc.indexOf('async deleteNote'));
  assert.ok(del.indexOf('deleteImagesOf') < del.indexOf('tx.objectStore(STORES.contents).delete'),
    '必须先删图片，再删笔记记录');
});

test('源码：listNotes 只扫 notes 表，不触碰正文表', () => {
  const list = dbSrc.slice(dbSrc.indexOf('async listNotes'), dbSrc.indexOf('async deleteNote'));
  assert.match(list, /STORES\.notes/, '只读 notes 表');
  assert.doesNotMatch(list, /STORES\.contents/, '列表查询不得读取正文表');
  assert.doesNotMatch(list, /STORES\.images/, '列表查询不得读取图片表');
});
