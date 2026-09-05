// Issue-51: 自定义文字颜色不生效 + 文字偏糊
// 规格要点：
//   1) 自由取色器（<input type="color" data-text-color-custom>）选中的颜色必须真正生效；
//      旧实现只在 click 委托里读取 tcin.value——此时原生取色面板尚未打开、读到的是旧值，
//      且 renderMe 重建 input 元素会让面板瞬间关闭，导致用户设置的颜色被丢弃。
//   2) 自定义色叠在背景图上时的文字阴影过宽（4px）显得发虚，收紧为更清晰的 1~2px。
// 浏览器交互无法在 Node 下模拟，故走源码接线断言 + app-core.js 纯函数断言。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  customTextColorVars,
  textShadowForHex,
  normalizeTextColor,
  isHexColor,
} from '../src/app-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../work-memo-app.html'), 'utf8');

function section(start, end) {
  const s = html.indexOf(start);
  const e = html.indexOf(end, s);
  assert.ok(s >= 0 && e > s, `锚点失效: ${start} -> ${end}`);
  return html.slice(s, e);
}

/* ---------------- 取色器事件接线 ---------------- */

test('源码：click 委托中不得残留自定义取色器的旧处理逻辑', () => {
  // 旧代码：点击时读取尚未打开的面板里的旧值，且会触发 renderMe 重建 input 关闭面板
  assert.doesNotMatch(
    html,
    /var tcin=e\.target\.closest\('\[data-text-color-custom\]'\); if\(tcin\)\{ onTextColorPick\(tcin\.value\); return; \}/,
    'click 委托里不能再处理自定义取色器'
  );
});

test('源码：自定义取色器改由 #app 的 input/change 委托监听真正捕获选中色', () => {
  assert.match(html, /function onCustomColorInput\(e\)\{/, '定义 onCustomColorInput 处理函数');
  // 桌面端拖动连续触发 input，移动端面板确认触发 change，两者都带最新值
  assert.match(html, /getElementById\('app'\)\.addEventListener\('input', onCustomColorInput\);/, 'input 委托');
  assert.match(html, /getElementById\('app'\)\.addEventListener\('change', onCustomColorInput\);/, 'change 委托');
  const fn = section('function onCustomColorInput(e){', "getElementById('app').addEventListener('input', onCustomColorInput);");
  assert.match(fn, /var tcin = e\.target\.closest\('\[data-text-color-custom\]'\);/, '从事件目标取出取色器');
  assert.match(fn, /var v = tcin\.value;/, '读取用户真正选中的值');
  assert.match(fn, /onTextColorPick\(v\);/, '用选中值调用应用逻辑');
  assert.match(fn, /normalizeTextColor\(v\) === normalizeTextColor\(DB\.settings\.textColor\)/, '与已保存值去重，避免重复保存/重渲染');
});

/* ---------------- applyTextColor 写入内联变量 ---------------- */

test('源码：applyTextColor 对自定义色写入内联 CSS 变量（内联优先级高于属性选择器）', () => {
  const fn = section('function applyTextColor(color){', 'function onStylePick(style){');
  assert.match(fn, /app\.setAttribute\('data-text-color', 'custom'\);/, '自定义色切换到 custom 模式');
  assert.match(fn, /var vars = customTextColorVars\(c\);/, '由 hex 生成变量集合');
  assert.match(fn, /Object\.keys\(vars\)\.forEach\(function\(k\)\{ app\.style\.setProperty\(k, vars\[k\]\); \}\)/, '把 --text/--text-2/--text-3/--body 写成内联样式');
  assert.match(fn, /app\.style\.setProperty\('--text-shadow', textShadowForHex\(c\)\);/, '按颜色亮度设置文字阴影');
});

/* ---------------- 纯函数：颜色变量与阴影 ---------------- */

test('customTextColorVars 把 hex 转成带透明度的文字变量集合', () => {
  const v = customTextColorVars('#FFD54A');
  assert.equal(v['--text'], 'rgb(255,213,74)');
  assert.equal(v['--text-2'], 'rgba(255,213,74,.82)');
  assert.equal(v['--text-3'], 'rgba(255,213,74,.6)');
  assert.equal(v['--body'], 'rgb(255,213,74)');
  assert.equal(customTextColorVars('not-a-color'), null, '非法色返回 null，调用方不应写入');
});

test('textShadowForHex 收紧阴影，文字更清晰（修复发虚）', () => {
  // 深色字 → 浅色阴影；浅色字 → 深色阴影。v1.6.5 双层阴影（近层锐利 + 远层柔化）
  assert.equal(textShadowForHex('#000000'), '0 0 1px rgba(255,255,255,.95), 0 1px 2px rgba(255,255,255,.55)');
  assert.equal(textShadowForHex('#FFFFFF'), '0 0 1px rgba(0,0,0,.95), 0 2px 5px rgba(0,0,0,.65)');
  assert.equal(textShadowForHex('#FFD54A'), '0 0 1px rgba(0,0,0,.95), 0 2px 5px rgba(0,0,0,.65)', '亮黄属于浅色，用深色阴影');
});

test('normalizeTextColor / isHexColor 正确归一化自定义色', () => {
  assert.equal(normalizeTextColor('#FFD54A'), '#ffd54a', '大写+缩写需规范化');
  assert.equal(normalizeTextColor('auto'), 'auto', '预设原样返回');
  assert.equal(isHexColor('#abc'), true);
  assert.equal(isHexColor('#FFD54A'), true);
  assert.equal(isHexColor('red'), false, '非 hex 不被误判');
});
