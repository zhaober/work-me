import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ============================================================
   Issue-46：多图的数据管线（水合 / 释放 / 选入 / 迁移 / 导出）
   work-memo-app.html 是依赖 DOM 与 IndexedDB 的经典脚本，无法在
   Node 里直接执行，这里对关键接线做静态断言，行为部分由
   issue-45（纯函数）与 issue-32（fake-indexeddb 集成）覆盖。
   ============================================================ */

/** 截取从 startMarker 到 endMarker 之间的源码片段 */
function section(startMarker, endMarker) {
  const i = html.indexOf(startMarker);
  if (i < 0) return '';
  const j = html.indexOf(endMarker, i + startMarker.length);
  return j < 0 ? html.slice(i) : html.slice(i, j);
}

const applyShape = section('function applyDbShape', '\n}');
const hydrate = section('async function hydrateRecordImages', '\nasync function hydrateImages');
const resolveUrl = section('async function resolveImageUrl', '\n/**');
const releaseOne = section('function releaseImageUrl', '\n/** 清理已无记录引用');
const releaseUnused = section('function releaseUnusedImageUrls', '\n}');
const pick = section('async function handleImagePick', '\n/**');
const fileChange = section("getElementById('imgFile').addEventListener('change'", '\n});');
const migrate = section('r.id = k;', 'delete r.image;      // 运行时字段，不入库');
const exp = section('async function buildExportRecords', '\n}');

test('记录整形：统一为 image_ids 数组并退役旧单值字段', () => {
  assert.ok(applyShape.includes('r.image_ids = recordImageIds(r)'), '应按 image_ids 归一化');
  assert.ok(applyShape.includes('delete r.image_id'), '旧 image_id 不再作为运行时字段');
  assert.ok(applyShape.includes('delete r.image'), '旧 image 不再作为运行时字段');
});

test('水合：images 与 image_ids 等长，缺失图以 null 占位', () => {
  assert.ok(hydrate.includes('rec.image_ids = ids'), '水合前先归一化 id');
  assert.ok(hydrate.includes('rec.images = []'), 'images 从空数组开始重建');
  assert.ok(/rec\.images\.push\(await resolveImageUrl\(ids\[i\]\)\)/.test(hydrate),
    '必须逐个 push 而非过滤，否则下标会与 image_ids 错位');
});

test('单图解析：Blob 缺失返回 null 而不抛异常', () => {
  assert.ok(resolveUrl.includes('return null'), '缺图时返回 null');
  assert.ok(/catch\(e\)\{\s*return null;/.test(resolveUrl), '异常也要兜成 null，避免一张坏图拖垮整条记录');
});

test('释放 objectURL：引用判定走 isImageIdUsed / collectUsedImageIds', () => {
  assert.ok(releaseOne.includes('isImageIdUsed(DB.records, imageId)'), '释放前先确认无人引用');
  assert.ok(releaseUnused.includes('collectUsedImageIds(DB.records)'), '批量清理按全部记录的图片 id 汇总');
  assert.ok(!/image_id\s*===\s*imageId/.test(releaseOne), '不得再用单值字段判定引用');
});

test('选图：接受多文件、超出上限截断、入库后重新水合并重绘', () => {
  assert.ok(/async function handleImagePick\(files\)/.test(pick), '签名接受文件列表而非单个文件');
  assert.ok(pick.includes('MAX_IMAGES_PER_RECORD - ids.length'), '按上限计算剩余可添加张数');
  assert.ok(pick.includes('list.slice(0, room)'), '超出的部分被丢弃');
  assert.ok(pick.includes('normalizeImageIds(ids)'), '写回前归一化（去重 + 截断）');
  assert.ok(pick.includes('await hydrateRecordImages(editing.data)'), '重新水合保证 images 与 image_ids 对齐');
  assert.ok(pick.includes('renderEditorImages()'), '通知 UI 重绘图片网格');
});

test('文件选择框：一次可多选，且立即清空 value 以便重选同一张', () => {
  assert.ok(fileChange.includes('Array.prototype.slice.call(this.files)'), '取全部选中文件');
  assert.ok(fileChange.includes("this.value=''"), '清空 value，否则连选同一张不触发 change');
});

test('localStorage 迁移：旧单值 image_id 收敛进 image_ids', () => {
  assert.ok(migrate.includes('var ids = recordImageIds(r)'), '先读出旧结构里的图片');
  assert.ok(migrate.includes('r.image_ids = normalizeImageIds(ids)'), '统一写成数组');
  assert.ok(migrate.includes('delete r.image_id'), '迁移后不再保留旧字段');
});

test('导出：多图内联为 images_base64 数组，不再用单值 image_base64', () => {
  assert.ok(exp.includes('rec.image_ids=ids'), '导出前归一化 id 列表');
  assert.ok(exp.includes('rec.images_base64=[]'), '多图以数组导出');
  assert.ok(exp.includes('delete rec.images'), '运行时 blob URL 不进导出文件');
  assert.ok(exp.includes('rec.images_base64.push(null)'), '缺失图占位，保证与 image_ids 等长');
  assert.ok(!/rec\.image_base64\s*=/.test(exp), '单值导出字段已废弃');
});
