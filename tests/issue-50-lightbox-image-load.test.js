import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

const html = fs.readFileSync('work-memo-app.html', 'utf8');

function section(start, end) {
  const s = html.indexOf(start);
  const e = html.indexOf(end, s);
  assert.ok(s >= 0 && e > s, `锚点失效: ${start} -> ${end}`);
  return html.slice(s, e);
}

test('源码：resolveImageUrl 支持 forceRefresh 强制重建 blob URL', () => {
  const fn = section('async function resolveImageUrl(imageId, forceRefresh)', '\nasync function hydrateRecordImages');
  assert.match(fn, /var cached = imageUrlCache\[imageId\]/, '读取缓存对象');
  assert.match(fn, /if\(cached && cached\.url && !forceRefresh\)/, '缓存命中且非强制时复用');
  assert.match(fn, /imageUrlCache\[imageId\] = \{url: url, blob: blob\}/, '缓存同时保留 url 与 blob');
});

test('源码：releaseImageUrl / releaseUnusedImageUrls 按新缓存结构释放', () => {
  const rel = section('function releaseImageUrl(imageId)', '\nfunction releaseUnusedImageUrls');
  assert.match(rel, /var cached = imageUrlCache\[imageId\]/, '读取缓存对象');
  assert.match(rel, /URL\.revokeObjectURL\(cached\.url\)/, 'revoke 缓存中的 url 字段');
  const clean = section('function releaseUnusedImageUrls()', '\nasync function refreshImageStats');
  assert.match(clean, /var cached = imageUrlCache\[imageId\]/, '批量清理也读取缓存对象');
});

test('源码：lbGoto 为 lightboxImg 挂载 onerror 自愈逻辑', () => {
  const fn = section('function lbGoto(i)', '\nfunction lbStep');
  assert.match(fn, /img\.onerror = function\(\)/, 'lightbox 图片加载失败时触发回调');
  assert.match(fn, /resolveImageUrl\(editing\.data\.image_ids\[i\], true\)/, '失败后强制刷新该图 URL');
  assert.match(fn, /editing\.data\.images\[i\] = newUrl/, '用新 URL 更新记录运行时数组');
  assert.match(fn, /img\.src = newUrl/, '重设图片 src 尝试重新加载');
  assert.match(fn, /closeLightbox\(\)/, '强制刷新也失败时关闭 lightbox');
});

test('源码：imageUrlCache 初始化仍为空对象', () => {
  assert.match(html, /var imageUrlCache = \{\};/, '缓存以空对象启动');
});
