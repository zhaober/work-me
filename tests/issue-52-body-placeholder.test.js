// Issue-52: 正文输入框增加醒目样式 + 「请输入文本」占位提示
// 规格要点：
//   1) 正文编辑区（.t-body contenteditable）原本是裸文本，看不出可输入；改为卡片样式（背景/边框/圆角/最小高度）明确告知。
//   2) 空正文时显示占位文案「请输入文本」；占位用 data-placeholder + .is-empty 类控制，避免 contenteditable 的 :empty 不稳定问题。
//   注意：基础 .t-body 还被用于「计划完成度」等非编辑展示，不能改全局；仅给可编辑区加 .t-body-edit。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../work-memo-app.html'), 'utf8');

function section(start, end) {
  const s = html.indexOf(start);
  const e = html.indexOf(end, s);
  assert.ok(s >= 0 && e > s, `锚点失效: ${start} -> ${end}`);
  return html.slice(s, e);
}

/* ---------------- 卡片样式 ---------------- */

test('源码：正文编辑区使用醒目卡片样式 .t-body-edit', () => {
  assert.match(html, /\.t-body-edit\{[^}]*background:var\(--card\)/, '卡片背景');
  assert.match(html, /\.t-body-edit\{[^}]*border:1px solid var\(--border\)/, '卡片边框');
  assert.match(html, /\.t-body-edit\{[^}]*border-radius:14px/, '圆角');
  assert.match(html, /\.t-body-edit\{[^}]*min-height:160px/, '足够高的可写区域');
  assert.match(html, /\.t-body-edit\{[^}]*white-space:pre-wrap/, '保留换行（与段落保存配合）');
});

/* ---------------- 占位提示 ---------------- */

test('源码：空正文显示「请输入文本」占位，且不影响非编辑的 .t-body', () => {
  assert.match(html, /data-placeholder="请输入文本"/, '占位文案为「请输入文本」');
  assert.match(html, /class="t-body t-body-edit"/, '可编辑正文挂上 t-body-edit 类（计划/复盘通用）');
  assert.match(html, /\.t-body-edit\.is-empty:before\{content:attr\(data-placeholder\)/, '占位由 data-placeholder 驱动');
  assert.match(html, /\.t-body-edit\.is-empty:before\{[^}]*color:var\(--text-3\)/, '占位用弱化文字色');
  // 非编辑展示（计划完成度里的 .t-body）不应带 t-body-edit，避免误显占位
  const compare = section("if(d.linkPlanId && DB.records[d.linkPlanId]){", "html+='</div>';");
  assert.doesNotMatch(compare, /class="t-body t-body-edit"/, '关联计划展示里的 .t-body 不带编辑样式');
});

/* ---------------- 占位显隐同步 ---------------- */

test('源码：bindEditor 用 is-empty 类控制占位显隐', () => {
  assert.match(html, /function syncBodyPlaceholder\(el\)\{/, '定义 syncBodyPlaceholder');
  assert.match(html, /function syncBodyPlaceholder\(el\)\{[\s\S]{0,200}?el\.classList\.toggle\('is-empty', empty\)/, '空状态切换 is-empty');

  const bind = section("var bodyEl=document.getElementById(type+'Body');", "c.querySelectorAll('[data-priority]')");
  assert.match(bind, /bodyEl\.addEventListener\('input', function\(\)\{ editing\.data\.body=this\.textContent; syncBodyPlaceholder\(bodyEl\); autoSaveDraft\(\); \}\)/, '输入时同步占位');
  assert.match(bind, /if\(bodyEl\)\{[\s\S]{0,300}?syncBodyPlaceholder\(bodyEl\);/, '初次渲染即同步占位（空则显示）');
});
