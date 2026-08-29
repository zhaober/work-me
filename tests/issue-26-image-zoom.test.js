// Issue-26: 查看图片时无法放大/缩小（lightbox 只展示原图）。
// 需求：支持放大、缩小、平移，桌面用滚轮，移动端用双指捏合 + 单指拖动，
//   双击在 1x 与 2x 之间快速切换。
// 修复：
//   1) 纯函数 clampScale / nextImageScale / toggleImageScale 控制倍率与夹取
//   2) lightbox 增加缩放 stage、＋/− 按钮、倍率读数，接入滚轮/双击/捏合/拖动
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  IMAGE_VIEWER_LIMITS,
  clampScale,
  nextImageScale,
  toggleImageScale,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ---------- IMAGE_VIEWER_LIMITS ---------- */

test('图片查看器缩放限制：1x~5x，单步 0.3', () => {
  assert.deepEqual(IMAGE_VIEWER_LIMITS, { minScale: 1, maxScale: 5, step: 0.3 });
});

/* ---------- clampScale ---------- */

test('clampScale 把倍率夹到 [min,max]，非法回落 1', () => {
  assert.equal(clampScale(0.5, 1, 5), 1);
  assert.equal(clampScale(10, 1, 5), 5);
  assert.equal(clampScale(2.5, 1, 5), 2.5);
  assert.equal(clampScale(NaN, 1, 5), 1);
  assert.equal(clampScale(-3, 1, 5), 1);
  assert.equal(clampScale(0, 1, 5), 1);
});

/* ---------- nextImageScale ---------- */

test('nextImageScale 放大按倍增，并夹到上限', () => {
  assert.equal(nextImageScale(1, 0.3, 1, 5), 1.3);
  assert.equal(nextImageScale(2, 0.3, 1, 5), 2.6);
  // 超过上限夹到 5
  assert.equal(nextImageScale(5, 0.3, 1, 5), 5);
});

test('nextImageScale 缩小按倍增，并在 1x 处停住', () => {
  // 1x 再缩小仍是 1x（不能低于最小倍率）
  assert.equal(nextImageScale(1, -0.3, 1, 5), 1);
  assert.equal(nextImageScale(2, -0.3, 1, 5), 2 / 1.3);
  assert.equal(nextImageScale(0.5, -0.3, 1, 5), 1);
});

test('nextImageScale delta 为 0 或非法时原样夹取', () => {
  assert.equal(nextImageScale(2, 0, 1, 5), 2);
  assert.equal(nextImageScale(2, NaN, 1, 5), 2);
});

/* ---------- toggleImageScale ---------- */

test('toggleImageScale 在 1x 与目标倍率(2x)间切换', () => {
  // 未放大（≈1x）时放大到 2x
  assert.equal(toggleImageScale(1, 1, 5, 2), 2);
  // 已放大到 2x 时复位到 1x
  assert.equal(toggleImageScale(2, 1, 5, 2), 1);
});

test('toggleImageScale 处于中间倍率时双重点按复位到 1x', () => {
  // 1.5x 视为已放大，双击复位最小倍率
  assert.equal(toggleImageScale(1.5, 1, 5, 2), 1);
  assert.equal(toggleImageScale(1.5, 1, 5, 2), 1);
});

/* ---------- 源码接线 ---------- */

test('import 列表已引入图片查看器纯函数', () => {
  assert.match(html, /IMAGE_VIEWER_LIMITS/, '应导入缩放限制');
  assert.match(html, /nextImageScale/, '应导入倍率计算');
  assert.match(html, /clampScale/, '应导入夹取函数');
  assert.match(html, /toggleImageScale/, '应导入双击切换函数');
});

test('lightbox 具备缩放控件与倍率读数', () => {
  assert.match(html, /id="lightboxStage"/, '应存在缩放舞台容器');
  assert.match(html, /id="lbZoomIn"/, '应存在放大按钮');
  assert.match(html, /id="lbZoomOut"/, '应存在缩小按钮');
  assert.match(html, /id="lbScale"/, '应存在倍率读数');
});

test('缩放交互已接入：滚轮 / 双击 / 捏合 / 拖动', () => {
  assert.match(html, /addEventListener\('wheel'/, '桌面滚轮缩放');
  assert.match(html, /'dblclick'/, '双击切换倍率');
  assert.match(html, /touchstart[\s\S]*?touches\.length===2/, '双指捏合起始');
  assert.match(html, /touchmove[\s\S]*?pinch\.scale \* \(d\/pinch\.d\)/, '捏合按距离比例缩放');
  assert.match(html, /lbScale>1[\s\S]*?pan/, '放大后可单指拖动平移');
});

test('打开/关闭 lightbox 时倍率复位到 1x', () => {
  assert.match(html, /function openLightbox\(src\)\{[\s\S]*?lbReset\(\)/, '打开时复位倍率');
  assert.match(html, /function closeLightbox\(\)\{[\s\S]*?lbReset\(\)/, '关闭时复位倍率');
});
