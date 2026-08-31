// Issue-53 / Issue-54: 正文段落（换行）无法保存
// 规格要点：
//   1) 正文编辑区此前用 this.textContent 捕获，会把 <br>/<div> 折叠掉，换行/段落丢失。
//   2) 改用 this.innerText 捕获（保留 \n），配合 .t-body-edit 的 white-space:pre-wrap，编辑器内换行可见、保存后重新打开仍是多段。
//   3) 正文仍以 escapeHtml 纯文本转义渲染，不把内容当 HTML 注入（无 XSS）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../work-memo-app.html'), 'utf8');

/* ---------------- 捕获用 innerText ---------------- */

test('源码：正文用 innerText 捕获，保留换行/段落', () => {
  assert.match(html, /editing\.data\.body=this\.innerText; syncBodyPlaceholder\(bodyEl\); autoSaveDraft\(\);/, '输入实时保存用 innerText');
  assert.match(html, /var bEl=document\.getElementById\(editing\.type\+'Body'\); if\(bEl\) d\.body=bEl\.innerText;/, '保存落盘用 innerText');
  // 旧写法必须彻底消失，否则仍会丢失换行
  assert.doesNotMatch(html, /editing\.data\.body=this\.textContent/, '不得再用 textContent 捕获正文');
  assert.doesNotMatch(html, /d\.body=bEl\.textContent/, 'saveEditor 不得再用 textContent');
});

/* ---------------- 渲染保留换行 ---------------- */

test('源码：编辑器以 pre-wrap 渲染正文，换行可见且保存后不丢', () => {
  assert.match(html, /\.t-body-edit\{[^}]*white-space:pre-wrap/, '编辑器 white-space:pre-wrap 保留换行');
});

/* ---------------- 安全渲染 ---------------- */

test('源码：正文仍以纯文本转义渲染，不引入 HTML 注入', () => {
  // 两处（计划/复盘）都用 escapeHtml(d.body) 渲染，正文是转义后的纯文本而非原始 HTML
  const n = (html.match(/escapeHtml\(d\.body\|\|''\)/g) || []).length;
  assert.ok(n >= 2, '计划与复盘正文均经 escapeHtml 转义（实际 ' + n + ' 处）');
});
