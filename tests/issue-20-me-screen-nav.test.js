// Issue-20: 「我的」界面交互失效（主题/风格/音效/重要日子/导出/背景无法点击）
// 根因：屏幕 <section> 区块误带 data-nav 属性，被点击委托第一行
//   e.target.closest('[data-nav]') 命中，触发 navTo 并 return，
//   导致 me 屏内子控件的专属处理器永远执行不到。
// 修复：移除 4 个屏幕区块的 data-nav（侧边栏导航项仍保留 data-nav）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

test('屏幕 section 区块不得携带 data-nav（否则点击会被导航拦截）', () => {
  const sectionTags = html.match(/<section\b[^>]*>/g) || [];
  const offenders = sectionTags.filter((tag) => /\sdata-nav=/.test(tag));
  assert.equal(
    offenders.length,
    0,
    '仍有屏幕区块带 data-nav，会拦截 me 屏内子控件点击: ' + JSON.stringify(offenders)
  );
});

test('侧边栏导航仍依赖 data-nav（导航不被误删）', () => {
  // snav 项生成与点击委托处理器都应保留 data-nav
  assert.match(html, /snav-item[^>]*data-nav=/, '侧边栏导航项应保留 data-nav');
  assert.match(html, /closest\('\[data-nav\]'\)/, '点击委托应仍处理 [data-nav]（侧边栏）');
});

test('「我的」界面渲染包含全部交互控件标记', () => {
  // renderMe 输出的关键控件标记必须存在
  const markers = [
    'data-theme-btn',   // 外观与主题 开关
    'data-sound',       // 交互音效 开关
    'data-go-events',   // 重要日子
    'data-export',      // 导出数据
    'data-style-opt',   // 界面风格 选项
    'data-bg-upload',   // 自定义背景
  ];
  for (const m of markers) {
    assert.ok(html.includes(m), `renderMe 缺少交互控件标记: ${m}`);
  }
});

test('点击委托存在 me 屏各子控件的专属处理分支', () => {
  // 这些分支必须在 [data-nav] 分支之后，用于接管 me 屏交互
  assert.match(html, /closest\('\[data-theme-btn\]'\)/, '缺少 主题 处理分支');
  assert.match(html, /closest\('\[data-sound\]'\)/, '缺少 音效 处理分支');
  assert.match(html, /closest\('\[data-go-events\]'\)/, '缺少 重要日子 处理分支');
  assert.match(html, /closest\('\[data-export\]'\)/, '缺少 导出 处理分支');
  assert.match(html, /closest\('\[data-style-opt\]'\)/, '缺少 界面风格 处理分支');
  assert.match(html, /closest\('\[data-bg-upload\]'\)/, '缺少 背景上传 处理分支');
});
