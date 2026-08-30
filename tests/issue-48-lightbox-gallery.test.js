import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextImageIndex, formatImageCounter } from '../src/app-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ============================================================
   Issue-48：Lightbox 多图浏览
   翻页 / 计数是可测的纯逻辑；手势、按键与接线做静态断言。
   ============================================================ */

function section(startMarker, endMarker) {
  const i = html.indexOf(startMarker);
  if (i < 0) return '';
  const j = html.indexOf(endMarker, i + startMarker.length);
  return j < 0 ? html.slice(i) : html.slice(i, j);
}

/* ---------- 翻页纯函数 ---------- */

test('nextImageIndex：往后 / 往前各翻一张', () => {
  assert.equal(nextImageIndex(0, 5, 1), 1);
  assert.equal(nextImageIndex(3, 5, -1), 2);
});

test('nextImageIndex：到头循环，不会卡在边界', () => {
  assert.equal(nextImageIndex(4, 5, 1), 0, '最后一张再往后回到第一张');
  assert.equal(nextImageIndex(0, 5, -1), 4, '第一张再往前回到最后一张');
});

test('nextImageIndex：只有一张时始终停在它自己', () => {
  assert.equal(nextImageIndex(0, 1, 1), 0);
  assert.equal(nextImageIndex(0, 1, -1), 0);
});

test('nextImageIndex：无图或参数非法返回 -1，调用方据此不翻页', () => {
  assert.equal(nextImageIndex(0, 0, 1), -1);
  assert.equal(nextImageIndex(0, -3, 1), -1);
  assert.equal(nextImageIndex(0, null, 1), -1);
  assert.equal(nextImageIndex(0, 'x', 1), -1);
});

test('nextImageIndex：下标越界或为空时先归一到合法位置', () => {
  assert.equal(nextImageIndex(-1, 3, 1), 0, '未选中任何图时从第一张开始');
  assert.equal(nextImageIndex(99, 3, 1), 1, '越界下标先取模归一（99 → 0），再前进一步');
  assert.equal(nextImageIndex(null, 3, 1), 1, 'null 视作 0 再前进一步');
});

/* ---------- 计数纯函数 ---------- */

test('formatImageCounter：输出「第 n / m 张」', () => {
  assert.equal(formatImageCounter(0, 5), '第 1 / 5 张');
  assert.equal(formatImageCounter(4, 5), '第 5 / 5 张');
});

test('formatImageCounter：无图或下标越界返回空串，便于隐藏计数', () => {
  assert.equal(formatImageCounter(0, 0), '');
  assert.equal(formatImageCounter(-1, 3), '');
  assert.equal(formatImageCounter(3, 3), '');
  assert.equal(formatImageCounter(null, 3), '');
});

/* ---------- 接线：静态断言 ---------- */

test('lightbox 结构：上一张 / 下一张 / 计数三个元素齐备', () => {
  assert.match(html, /id="lbPrev"/);
  assert.match(html, /id="lbNext"/);
  assert.match(html, /id="lbCount"/);
  assert.match(html, /id="lbNav"/, '导航条需要能整体隐藏');
});

test('翻页：lbStep 走纯函数，越界不动作', () => {
  const step = section('function lbStep(delta)', '\n/** 打开当前记录的第 index 张图');
  if (!step) {
    // 顺序可能与预期不同，退化为全文断言
    assert.match(html, /nextImageIndex\(lbIndex, lbTotal\(\), delta\)/);
    assert.match(html, /if\(next < 0\) return;/);
    return;
  }
  assert.match(step, /nextImageIndex\(lbIndex, lbTotal\(\), delta\)/, '翻页逻辑交给纯函数');
  assert.match(step, /if\(next < 0\) return;/, '无图时直接返回，不切换');
});

test('跳转：lbGoto 复位缩放并同步计数，越界与缺图都忽略', () => {
  const goto = section('function lbGoto(i)', '\n/** 相对翻页');
  assert.match(goto, /i < 0 \|\| i >= urls\.length \|\| !urls\[i\]\) return;/, '越界或缺图不动');
  assert.match(goto, /lbReset\(\);/, '换图要复位缩放，否则上一张的放大状态会带过来');
  assert.match(goto, /lbSyncNav\(\);/, '换图后更新计数');
});

test('计数与导航条：只有一张时隐藏左右切换', () => {
  const sync = section('function lbSyncNav()', '\n/** 直接跳到第 i 张');
  assert.match(sync, /total > 1\) \? 'flex' : 'none'/, '单图不给翻页入口');
  assert.match(sync, /formatImageCounter\(idx, total\)/, '复用纯函数生成文案');
});

test('左右滑动切换：仅未放大时生效，且要求横向位移明显', () => {
  const touch = section("lbStage.addEventListener('touchend'", '\n})();');
  assert.match(touch, /lbScale<=1\.001/, '放大状态下横滑属于拖动图片，不能抢成翻页');
  assert.match(touch, /Math\.abs\(dx\)>50/, '位移阈值，避免误触');
  assert.match(touch, /Math\.abs\(dx\)>Math\.abs\(dy\)\*1\.5/, '必须明显是横向滑动');
  assert.match(touch, /lbStep\(dx<0\?1:-1\)/, '左滑看下一张、右滑看上一张');
});

test('键盘：左右方向键翻页，Esc 关闭', () => {
  const kb = section("document.addEventListener('keydown'", '\n});');
  assert.match(kb, /ArrowLeft[\s\S]{0,80}lbStep\(-1\)/);
  assert.match(kb, /ArrowRight[\s\S]{0,80}lbStep\(1\)/);
  assert.match(kb, /Escape[\s\S]{0,60}closeLightbox\(\)/);
  assert.match(kb, /classList\.contains\('show'\)\)/, '只有 lightbox 打开时才响应');
});

test('关闭与删除：退出时复位下标，删除的是当前这张', () => {
  assert.match(html, /function closeLightbox\(\)[\s\S]{0,200}lbIndex=-1/, '关闭后不再指向任何一张');
  const del = section("getElementById('lbDel').addEventListener('click'", '\n});');
  assert.match(del, /var idx = lbIndex;/, '先取当前下标');
  assert.match(del, /closeLightbox\(\);/, '先关大图，避免删完还停在已失效的索引上');
  assert.match(del, /if\(idx >= 0\) deleteImageAt\(idx\);/, '再删那一张');
});
