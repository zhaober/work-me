/*
 * Issue #57 修复测试：
 *   Bug① 深色背景图上有文字重影/模糊（backdrop-filter + text-shadow 叠加）
 *   Bug② 今日计划退出后 bottombar 未隐藏，按钮浮动到导航栏
 *
 * 测试策略：静态正则断言 HTML 中的关键修复点。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, '..', 'work-memo-app.html'), 'utf8');
const CORE = readFileSync(join(__dirname, '..', 'src', 'app-core.js'), 'utf8');

/* ---------- Bug ② 今日计划底栏错位 ---------- */

test('Bug② show() 函数在切离 todayPlan 时隐藏 todayPlanBottombar', () => {
  // show() 里应有 id !== 'todayPlan' 判断
  assert.match(
    HTML,
    /function show\(id\)[\s\S]*?if\s*\(\s*id\s*!==\s*['"]todayPlan['"]\s*\)\s*\{[\s\S]*?getElementById\(['"]todayPlanBottombar['"]\)[\s\S]*?classList\.remove\(['"]show['"]\)/,
    'show() 应在目标不是 todayPlan 时 remove show 类'
  );
});

test('Bug② show() 中隐藏 todayPlanBottombar 位于 scrollTop 之前', () => {
  const m = HTML.match(/function show\(id\)\{([\s\S]*?)\n\}/);
  assert.ok(m, 'show() 函数必须存在');
  const body = m[1];
  const hideIdx = body.indexOf("todayPlanBottombar");
  const scrollIdx = body.indexOf("scrollTop");
  assert.ok(hideIdx !== -1, 'show() 应包含 todayPlanBottombar 隐藏逻辑');
  assert.ok(scrollIdx !== -1, 'show() 应保留 scrollTop = 0');
  assert.ok(hideIdx < scrollIdx, '隐藏 todayPlanBottombar 应在 scrollTop 之前执行');
});

test('Bug② renderTodayPlan 空状态仍会 remove show（回归保护）', () => {
  // 空状态分支原本就有 remove show，不能被误删
  const m = HTML.match(/function renderTodayPlan\(\)\{[\s\S]*?plans\.length === 0\)\{[\s\S]*?\}/);
  assert.ok(m, 'renderTodayPlan 空状态分支必须存在');
  assert.match(
    m[0],
    /todayPlanBottombar['"]\)\.classList\.remove\(['"]show['"]/,
    '空状态应 remove show 类'
  );
});

test('Bug② renderTodayPlan 非空状态仍会 toggle show（回归保护）', () => {
  assert.match(
    HTML,
    /todayPlanBottombar['"]\)\.classList\.toggle\(['"]show['"]/,
    '非空状态应 toggle show 类（保持原有逻辑）'
  );
});

test('Bug② 今日计划底部操作栏 HTML 与按钮 ID 保持不变', () => {
  assert.match(
    HTML,
    /<div class="today-plan-bottombar" id="todayPlanBottombar">[\s\S]*?id="tpDoneBtn"[^>]*>全部完成<\/button>[\s\S]*?id="tpMoveBtn"[^>]*>移到下一天<\/button>/,
    '今日计划底部操作栏结构与按钮 ID 不变'
  );
});

/* ---------- Bug ① 深色背景文字重影/模糊 ---------- */

test('Bug① textShadowForHex 使用双层阴影提升对比度', () => {
  // 深色字用浅阴影（近层锐利 + 远层柔化），浅色字用深阴影
  const m = CORE.match(/export function textShadowForHex\([^\n]*\)\{([\s\S]*?)\n\}/);
  assert.ok(m, 'textShadowForHex 必须存在');
  const body = m[1];
  // 浅色字（深色字用浅阴影）分支：包含 0 0 1px + 0 1px 2px
  assert.match(body, /0 0 1px rgba\(255,255,255,[\s.]*95?/, '浅色字分支近层阴影：0 0 1px rgba(255,255,255,.95)');
  assert.match(body, /0 1px 2px rgba\(255,255,255,[\s.]*55/, '浅色字分支远层阴影：0 1px 2px rgba(255,255,255,.55)');
  // 深色字（浅色字用深阴影）分支：包含 0 0 1px + 0 2px 5px
  assert.match(body, /0 0 1px rgba\(0,0,0,[\s.]*95?/, '深色字分支近层阴影：0 0 1px rgba(0,0,0,.95)');
  assert.match(body, /0 2px 5px rgba\(0,0,0,[\s.]*65/, '深色字分支远层阴影：0 2px 5px rgba(0,0,0,.65)');
});

test('Bug① white 模式 CSS 变量预设 --text-shadow', () => {
  assert.match(
    HTML,
    /\.app\[data-text-color="white"\]\{[^}]*--text-shadow:\s*0 0 1px rgba\(0,0,0,[\s.]*9\)[^}]*0 2px 5px rgba\(0,0,0,[\s.]*6\)/,
    'white 模式应预设双层深色阴影'
  );
});

test('Bug① black 模式 CSS 变量预设 --text-shadow', () => {
  assert.match(
    HTML,
    /\.app\[data-text-color="black"\]\{[^}]*--text-shadow:\s*0 0 1px rgba\(255,255,255,[\s.]*95\)[^}]*0 2px 5px rgba\(255,255,255,[\s.]*5\)/,
    'black 模式应预设双层浅色阴影'
  );
});

test('Bug① has-bg 阴影选择器覆盖 t-meta / me-action / me-foot / tp-text', () => {
  // 新增 t-meta 覆盖（副标题/描述）
  assert.match(HTML, /\.app\.has-bg\[data-text-color="white"\] \.t-meta/, 'white 模式应覆盖 t-meta');
  assert.match(HTML, /\.app\.has-bg\[data-text-color="black"\] \.t-meta/, 'black 模式应覆盖 t-meta');
  assert.match(HTML, /\.app\.has-bg\[data-text-color="custom"\] \.t-meta/, 'custom 模式应覆盖 t-meta');
  assert.match(HTML, /\.app\.has-bg\[data-text-color="auto"\] \.t-meta/, 'auto 模式应覆盖 t-meta');
  // 新增 me-action（选择/发送/优化）
  assert.match(HTML, /\.app\.has-bg\[data-text-color="white"\] \.me-action/, 'white 模式应覆盖 me-action');
  // 新增 me-foot（页脚）
  assert.match(HTML, /\.app\.has-bg\[data-text-color="white"\] \.me-foot/, 'white 模式应覆盖 me-foot');
  // 新增 tp-text（今日计划待办文本）
  assert.match(HTML, /\.app\.has-bg\[data-text-color="white"\] \.tp-text/, 'white 模式应覆盖 tp-text');
});

test('Bug① auto 模式 has-bg 阴影规则存在（回归保护）', () => {
  assert.match(
    HTML,
    /\.app\.has-bg\[data-text-color="auto"\][\s\S]*?text-shadow:\s*var\(--text-shadow\)/,
    'auto 模式 has-bg 应有 text-shadow:var(--text-shadow) 规则'
  );
});

test('Bug① has-bg glass 卡片禁用 backdrop-filter 强模糊（改为极弱模糊 + 高不透明度）', () => {
  // 关键断言：has-bg 状态下，glass 卡片 background 透明度应 >= 90%（近乎实心）
  assert.match(
    HTML,
    /\.app\.has-bg #app\[data-style="glass"\] \.card[\s\S]*?background:\s*color-mix\(in srgb, var\(--card\) 9[0-9]%, transparent\)/,
    'has-bg 下 glass 卡片应使用 >=90% 不透明度'
  );
  // backdrop-filter blur 半径应 <= 10px（极弱模糊）
  assert.match(
    HTML,
    /\.app\.has-bg #app\[data-style="glass"\][\s\S]*?backdrop-filter:\s*blur\((?:[1-9]|10)px\)[\s\S]*?-webkit-backdrop-filter:\s*blur\((?:[1-9]|10)px\)/,
    'has-bg 下 glass 卡片 backdrop-filter blur 应 <=10px'
  );
});

test('Bug① has-bg glass 覆盖选择器包含 me-card / today-plan-card / today-review-card', () => {
  assert.match(HTML, /\.app\.has-bg #app\[data-style="glass"\] \.me-card/, '应覆盖 me-card');
  assert.match(HTML, /\.app\.has-bg #app\[data-style="glass"\] \.today-plan-card/, '应覆盖 today-plan-card');
  assert.match(HTML, /\.app\.has-bg #app\[data-style="glass"\] \.today-review-card/, '应覆盖 today-review-card');
  assert.match(HTML, /\.app\.has-bg #app\[data-style="glass"\] \.today-plan-stats \.card/, '应覆盖 today-plan-stats .card');
});

test('Bug① 原有 glass 样式规则（无 has-bg）保持不变', () => {
  // 无 has-bg 时 glass 仍是 66% 透明 + blur(18px)
  assert.match(
    HTML,
    /#app\[data-style="glass"\] \.card[\s\S]*?background:\s*color-mix\(in srgb, var\(--card\) 66%, transparent\); backdrop-filter:\s*blur\(18px\)/,
    '无 has-bg 时 glass 卡片保持 66% 透明 + 18px blur'
  );
});

/* ---------- 集成保护 ---------- */

test('集成：Bug①+Bug② 修复点同时存在（防回归）', () => {
  // 检查 4 个关键点都在
  const checks = [
    /if\s*\(\s*id\s*!==\s*['"]todayPlan['"]\s*\)[\s\S]*?todayPlanBottombar/,
    /0 0 1px rgba\(0,0,0,[\s.]*9\),?\s*0 2px 5px rgba\(0,0,0,[\s.]*6\)/,
    /color-mix\(in srgb, var\(--card\) 94%, transparent\)/,
    /blur\(8px\) saturate\(120%\)/,
  ];
  checks.forEach((re, i) => {
    assert.match(HTML, re, `修复点 #${i+1} 必须存在`);
  });
});
