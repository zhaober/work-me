import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_COLOR_OPTIONS,
  TEXT_COLOR_PRESETS,
  isHexColor,
  normalizeTextColor,
  hexToRgb,
  relativeLuminance,
  textShadowForHex,
  customTextColorVars,
} from '../src/app-core.js';

/* ============================================================
   Issue-42：用户希望文字颜色可自定义，而不只有黑白
   原来 TEXT_COLOR_OPTIONS 仅 auto/white/black，normalizeTextColor
   会拒绝一切其它值。现放开为接受任意 #RRGGBB / #RGB。
   ============================================================ */

test('TEXT_COLOR_PRESETS：保留 auto/white/black 并新增可自定义色板', () => {
  assert.ok(TEXT_COLOR_OPTIONS.includes('auto'));
  assert.ok(TEXT_COLOR_OPTIONS.includes('white'));
  assert.ok(TEXT_COLOR_OPTIONS.includes('black'));
  // 预设里应出现若干精选自定义色（取色器之外的一键选项）
  const custom = TEXT_COLOR_PRESETS.filter(v => v.startsWith('#'));
  assert.ok(custom.length >= 4, '应至少有 4 个精选自定义色，实际 ' + custom.length);
});

test('isHexColor：正确识别 #RGB / #RRGGBB，拒绝非法值', () => {
  assert.ok(isHexColor('#fff'));
  assert.ok(isHexColor('#FFFFFF'));
  assert.ok(isHexColor('#4F6EF7'));
  assert.ok(!isHexColor('fff'));
  assert.ok(!isHexColor('#gggggg'));
  assert.ok(!isHexColor('rgb(0,0,0)'));
  assert.ok(!isHexColor('#12'));
  assert.ok(!isHexColor('auto'));
});

test('normalizeTextColor：预设原样返回', () => {
  assert.strictEqual(normalizeTextColor('auto'), 'auto');
  assert.strictEqual(normalizeTextColor('white'), 'white');
  assert.strictEqual(normalizeTextColor('black'), 'black');
});

test('normalizeTextColor：合法十六进制被规范化（#RGB→#RRGGBB、转小写）', () => {
  assert.strictEqual(normalizeTextColor('#FFF'), '#ffffff');
  assert.strictEqual(normalizeTextColor('#ABCdef'), '#abcdef');
  assert.strictEqual(normalizeTextColor('#4F6EF7'), '#4f6ef7');
});

test('normalizeTextColor：非法值回落 auto', () => {
  assert.strictEqual(normalizeTextColor('red'), 'auto');
  assert.strictEqual(normalizeTextColor('#xyz'), 'auto');
  assert.strictEqual(normalizeTextColor(''), 'auto');
  assert.strictEqual(normalizeTextColor(null), 'auto');
  assert.strictEqual(normalizeTextColor(undefined), 'auto');
});

test('hexToRgb：解析正确', () => {
  assert.deepStrictEqual(hexToRgb('#ffffff'), { r:255, g:255, b:255 });
  assert.deepStrictEqual(hexToRgb('#000000'), { r:0, g:0, b:0 });
  assert.deepStrictEqual(hexToRgb('#4F6EF7'), { r:79, g:110, b:247 });
  assert.deepStrictEqual(hexToRgb('#fff'), { r:255, g:255, b:255 });
  assert.strictEqual(hexToRgb('invalid'), null);
});

test('relativeLuminance：纯黑≈0、纯白≈1，深色<浅色', () => {
  assert.ok(relativeLuminance('#000000') < 0.01);
  assert.ok(relativeLuminance('#ffffff') > 0.99);
  assert.ok(relativeLuminance('#222222') < relativeLuminance('#dddddd'));
});

test('textShadowForHex：深色字用浅阴影、浅色字用深阴影', () => {
  assert.strictEqual(textShadowForHex('#111111'), '0 1px 2px rgba(255,255,255,.9)');
  assert.strictEqual(textShadowForHex('#eeeeee'), '0 1px 3px rgba(0,0,0,.55)');
});

test('customTextColorVars：生成 --text/--text-2/--text-3/--body 四档透明度变量', () => {
  const v = customTextColorVars('#4F6EF7');
  assert.ok(v);
  assert.strictEqual(v['--text'], 'rgb(79,110,247)');
  assert.strictEqual(v['--text-2'], 'rgba(79,110,247,.82)');
  assert.strictEqual(v['--text-3'], 'rgba(79,110,247,.6)');
  assert.strictEqual(v['--body'], 'rgb(79,110,247)');
  assert.strictEqual(customTextColorVars('nope'), null);
});
