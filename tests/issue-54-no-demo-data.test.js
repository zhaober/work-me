import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const html = fs.readFileSync('work-memo-app.html', 'utf8');

function section(start, end) {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i + start.length);
  assert.ok(i >= 0, `section start anchor missing: ${start}`);
  assert.ok(j > i, `section end anchor missing after start: ${end}`);
  return html.slice(i, j + end.length);
}

describe('issue-54: 安装后不应残留测试/演示数据', () => {
  it('初始 DB.folders 为空对象，不含工作/个人/学习等演示文件夹', () => {
    const dbBlock = section('var DB = {', 'function childrenOf');
    assert.match(dbBlock, /folders:\s*\{\s*\}/, 'folders 初始应为空对象');
    assert.doesNotMatch(dbBlock, /name:'工作'/, '不应有「工作」演示文件夹');
    assert.doesNotMatch(dbBlock, /name:'个人'/, '不应有「个人」演示文件夹');
    assert.doesNotMatch(dbBlock, /name:'学习'/, '不应有「学习」演示文件夹');
  });

  it('初始 DB.records 为空对象，不含演示记录标题', () => {
    const dbBlock = section('var DB = {', 'function childrenOf');
    assert.match(dbBlock, /records:\s*\{\s*\}/, 'records 初始应为空对象');
    assert.doesNotMatch(dbBlock, /完成 Q3 新品上线方案/, '不应有 Q3 演示记录');
    assert.doesNotMatch(dbBlock, /设计心理学/, '不应有设计心理学演示记录');
    assert.doesNotMatch(dbBlock, /LeetCode 错题集/, '不应有 LeetCode 演示记录');
  });

  it('新建记录时不应再回退到硬编码的 work 文件夹', () => {
    assert.doesNotMatch(html, /currentFolder\|\|'work'/, 'newRecord/loadEditor 不应硬编码 work 回退');
  });

  it('应提供 ensureDefaultFolder 在无文件夹时自动创建默认文件夹', () => {
    assert.match(html, /function ensureDefaultFolder\(\)\{/, '应定义 ensureDefaultFolder');
    assert.match(html, /var ids = Object\.keys\(DB\.folders\);/, 'ensureDefaultFolder 应检查现有文件夹');
    assert.match(html, /DB\.folders\[id\] = \{name:'默认', parent:null, color:'accent'\};/, '无文件夹时应创建「默认」文件夹');
  });

  it('newRecord 与 loadEditor 的 folder 回退均应使用 ensureDefaultFolder', () => {
    assert.match(html, /function newRecord\(type\)\{\s*var fid=currentFolder\|\|ensureDefaultFolder\(\);/, 'newRecord 应使用 ensureDefaultFolder');
    assert.match(html, /else \{\s*var fid=folderId\|\|currentFolder\|\|ensureDefaultFolder\(\);/, 'loadEditor 应使用 ensureDefaultFolder');
  });
});
