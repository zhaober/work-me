import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_IMAGES_PER_RECORD, buildImageGridHtml } from '../src/app-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ============================================================
   Issue-47：编辑器多图宫格 UI
   行为部分（宫格 HTML）由 buildImageGridHtml 纯函数覆盖，
   接线部分（事件委托 / 多选 / 删除）做静态断言。
   ============================================================ */

function section(startMarker, endMarker) {
  const i = html.indexOf(startMarker);
  if (i < 0) return '';
  const j = html.indexOf(endMarker, i + startMarker.length);
  return j < 0 ? html.slice(i) : html.slice(i, j);
}

/* ---------- 宫格渲染：纯函数行为 ---------- */

test('宫格：每张图一个格子，末尾跟一个添加格', () => {
  const out = buildImageGridHtml(['a', 'b'], ['url-a', 'url-b'], 9);
  assert.equal((out.match(/data-img-index=/g) || []).length, 2, '两张图两个格子');
  assert.equal((out.match(/data-img-add/g) || []).length, 1, '未达上限时显示添加格');
  assert.ok(out.indexOf('data-img-index="0"') < out.indexOf('data-img-index="1"'), '按传入顺序渲染');
});

test('宫格：达到上限后不再显示添加格', () => {
  const ids = Array.from({ length: MAX_IMAGES_PER_RECORD }, (_, i) => 'id' + i);
  const urls = ids.map((_, i) => 'url' + i);
  const out = buildImageGridHtml(ids, urls, MAX_IMAGES_PER_RECORD);
  assert.equal((out.match(/data-img-index=/g) || []).length, MAX_IMAGES_PER_RECORD);
  assert.ok(!out.includes('data-img-add'), '满了就不该再给入口');
});

test('宫格：缺图的格子渲染为占位块，且不挤掉后续下标', () => {
  const out = buildImageGridHtml(['a', 'b', 'c'], ['url-a', null, 'url-c'], 9);
  assert.ok(out.includes('is-broken'), '缺图要有占位');
  assert.ok(out.includes('data-img-index="1"'), '第 2 张即使缺图也保留下标 1');
  assert.ok(out.includes('data-img-index="2"'), '第 3 张下标仍为 2，不能前移');
  assert.ok(out.indexOf('data-img-index="1"') < out.indexOf('data-img-index="2"'));
});

test('宫格：删除按钮携带正确下标，便于精确定位要删哪张', () => {
  const out = buildImageGridHtml(['a', 'b', 'c'], ['url-a', 'url-b', 'url-c'], 9);
  assert.ok(out.includes('data-img-del="0"'));
  assert.ok(out.includes('data-img-del="2"'), '第 3 张的删除按钮下标必须是 2');
});

test('宫格：脏数据（null / 重复 / 超限）被收敛后再渲染', () => {
  const out = buildImageGridHtml(['a', 'a', null, 'b'], ['url-a', 'url-a', 'x', 'url-b'], 9);
  assert.equal((out.match(/data-img-index=/g) || []).length, 2, '去重并剔除非法项');
});

test('宫格：urls 缺失时全部按缺图处理而不是报错', () => {
  const out = buildImageGridHtml(['a', 'b'], null, 9);
  assert.equal((out.match(/is-broken/g) || []).length, 2);
});

test('宫格：自定义文案生效（添加 / 缺图 / 删除）', () => {
  const out = buildImageGridHtml([], [], 9, { addLabel: '+ Add', brokenLabel: 'Missing', delLabel: 'x' });
  assert.ok(out.includes('+ Add'));
  assert.ok(out.includes('Missing') === false, '没有图片时不出现缺图文案');
  const one = buildImageGridHtml(['a'], [null], 9, { brokenLabel: 'Missing', delLabel: 'x' });
  assert.ok(one.includes('Missing'));
  assert.ok(one.includes('>x</span>'));
});

/* ---------- 接线：静态断言 ---------- */

test('样式：网格 / 格子 / 添加格 / 删除角标齐备，且老 WebView 有高度兜底', () => {
  assert.match(html, /\.img-grid\{[^}]*grid-template-columns:repeat\(3,1fr\)/, '三列网格');
  assert.match(html, /\.img-cell\{[^}]*aspect-ratio:1\/1/, '正方形格子');
  assert.match(html, /@supports not \(aspect-ratio: 1 \/ 1\)/, '不支持 aspect-ratio 时退化，避免格子塌陷');
  assert.match(html, /\.img-add\{/, '添加格样式');
  assert.match(html, /\.img-del\{/, '删除角标样式');
});

test('编辑器容器：plan 分支挂载 img-grid，不再使用旧的 imgblock', () => {
  assert.ok(html.includes("'<div class=\"img-grid\" id=\"'+type+'ImgGrid\"></div>'"), '计划编辑器挂多图宫格');
  assert.ok(!html.includes('imgblock'), '旧的整块图片区已废弃');
});

test('渲染：paintEditor 后调用 renderEditorImages 填充宫格', () => {
  const paint = section('function paintEditor()', '\nfunction chooseLinkPlan');
  assert.match(paint, /renderEditorImages\(\);/, '画完编辑器要填充图片宫格');
  const render = section('function renderEditorImages()', '\nfunction pickRecordImages(');
  assert.match(render, /buildImageGridHtml\(/, '宫格 HTML 由可测纯函数生成');
  assert.match(render, /MAX_IMAGES_PER_RECORD/, '把上限传给宫格渲染，决定何时不再显示添加格');
});

test('事件：删除 / 添加 / 预览三种点击各有归属', () => {
  const bind = section("c.querySelector('#'+type+'ImgGrid')", '\n  var lk=');
  assert.match(bind, /data-img-del/, '删除角标');
  assert.match(bind, /deleteImageAt\(parseInt/, '按携带的下标删图');
  assert.match(bind, /data-img-add/, '添加格');
  assert.match(bind, /pickRecordImages\(\)/, '点击添加唤起选图');
  assert.match(bind, /data-img-index/, '缩略图');
  assert.match(bind, /openRecordImage\(parseInt/, '按携带的下标开大图');
});

test('选图框支持一次多选', () => {
  assert.match(html, /id="imgFile" accept="image\/\*" multiple/, '一次可挑多张');
});

test('删除：先解引用，确认无人使用后才真删 Blob，并重绘与落盘', () => {
  const del = section('function deleteImageAt(index)', '\nfunction paintEditor');
  assert.match(del, /ids\.splice\(index, 1\)/, '先解除本条记录的引用');
  assert.match(del, /isImageIdUsed\(DB\.records, removedId\)/, '确认没有别的记录在用');
  assert.match(del, /noteDB\.deleteImage\(removedId\)/, '无人引用才真删，避免空间长期占用');
  assert.match(del, /releaseImageUrl\(removedId\)/, '释放 objectURL');
  assert.match(del, /renderEditorImages\(\)/, '重绘宫格');
  assert.match(del, /saveDB\(\)/, '落盘');
  assert.match(del, /index < 0 \|\| index >= ids\.length\) return;/, '越界下标直接忽略');
});

test('替换：lightbox 的替换按钮记录当前下标，选图后只换那一张', () => {
  assert.match(html, /pendingReplaceIndex = lbIndex;/, '记录正在看的是第几张');
  const pick = section('async function handleImagePick(files)', '\n/**');
  assert.match(pick, /if\(replacing\) list = list\.slice\(0, 1\);/, '替换时只取一张');
  assert.match(pick, /removedId = ids\[replaceAt\]; ids\[replaceAt\] = res\.imageId;/, '就地替换而非追加');
  assert.match(pick, /已替换这张图片/, '给用户明确反馈');
});

test('旧的整块图片变量已彻底移除，避免留下失效引用', () => {
  assert.ok(!html.includes('currentImgTarget'), 'currentImgTarget 已随 imgblock 一起废弃');
  assert.ok(!html.includes('lightboxType'), 'lightbox 改用 lbIndex 定位当前图');
});
