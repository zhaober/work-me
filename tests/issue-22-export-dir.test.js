// Issue-22: 导出功能只能落到浏览器默认下载目录，用户无法自定义导出文件夹
// 修复：
//   1) 新增「导出文件夹」入口，用 File System Access API(showDirectoryPicker) 选目录
//   2) 目录句柄结构化克隆后持久化到 IndexedDB，下次启动自动恢复
//   3) 导出时直接写入所选目录；不支持/未选择时降级为系统默认下载
//   4) 权限失效时明确提示重新选择，而非静默失败
// 纯逻辑（目录规范化 / 能力探测 / 目标路径汇总）抽到 app-core.js 便于测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normalizeExportDir,
  supportsDirectoryPicker,
  buildExportTarget,
  describeExportLocation,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ---------- 纯函数：目录规范化 ---------- */

test('normalizeExportDir 去除首尾空白与尾部斜杠', () => {
  assert.equal(normalizeExportDir('  /sdcard/Download/  '), '/sdcard/Download');
  assert.equal(normalizeExportDir('下载备份//'), '下载备份');
  assert.equal(normalizeExportDir('C:\\备份\\'), 'C:\\备份');
});

test('normalizeExportDir 空值一律返回 null（表示走系统默认下载目录）', () => {
  assert.equal(normalizeExportDir(null), null);
  assert.equal(normalizeExportDir(undefined), null);
  assert.equal(normalizeExportDir(''), null);
  assert.equal(normalizeExportDir('   '), null);
});

/* ---------- 纯函数：能力探测 ---------- */

test('supportsDirectoryPicker 依据 showDirectoryPicker 是否存在判断', () => {
  assert.equal(supportsDirectoryPicker({ showDirectoryPicker() {} }), true);
  assert.equal(supportsDirectoryPicker({}), false);
  assert.equal(supportsDirectoryPicker(null), false);
  assert.equal(supportsDirectoryPicker(undefined), false);
});

/* ---------- 纯函数：导出目标汇总 ---------- */

test('buildExportTarget 自定义目录时给出完整路径', () => {
  const t = buildExportTarget('导出-2026-08-29.json', '/sdcard/Download');
  assert.equal(t.isCustom, true);
  assert.equal(t.dir, '/sdcard/Download');
  assert.equal(t.path, '/sdcard/Download/导出-2026-08-29.json');
  assert.equal(t.fileName, '导出-2026-08-29.json');
});

test('buildExportTarget 无自定义目录时路径仅为文件名', () => {
  const t = buildExportTarget('导出-2026-08-29.json', null);
  assert.equal(t.isCustom, false);
  assert.equal(t.dir, null);
  assert.equal(t.path, '导出-2026-08-29.json');
});

test('describeExportLocation 复用目录规范化逻辑（目录名带空白也能正确拼路径）', () => {
  // 回归 Issue-21：describeExportLocation 现在走 normalizeExportDir
  const info = describeExportLocation('a.json', '  我的备份/  ');
  assert.equal(info.hasCustomDir, true);
  assert.equal(info.path, '我的备份/a.json');
});

/* ---------- 源码接线 ---------- */

test('「我的」界面提供「导出文件夹」入口，未设置时提示为系统下载目录', () => {
  assert.match(html, /data-export-dir/, 'renderMe 缺少导出文件夹入口');
  assert.match(html, /系统「下载」目录 · 点击更改/, '未设置时应提示当前为系统下载目录');
  assert.match(html, /已设为：'\+exportDirLabel/, '已设置时应显示所选目录名');
});

test('已设置导出文件夹时提供「恢复默认」按钮', () => {
  assert.match(html, /data-export-dir-clear/, '缺少恢复默认按钮');
  assert.match(html, /clearExportDir/, '缺少 clearExportDir 实现');
});

test('点击委托中「恢复默认」必须排在整行之前（否则会被整行吞掉）', () => {
  const iClear = html.indexOf("closest('[data-export-dir-clear]')");
  const iRow = html.indexOf("closest('[data-export-dir]')");
  assert.ok(iClear > 0, '缺少 data-export-dir-clear 处理分支');
  assert.ok(iRow > 0, '缺少 data-export-dir 处理分支');
  assert.ok(iClear < iRow, '恢复默认按钮须先于整行判断，否则点击被整行拦截');
});

test('选择文件夹使用 showDirectoryPicker 并持久化句柄', () => {
  assert.match(html, /showDirectoryPicker\(/, '应调用 showDirectoryPicker 选择目录');
  assert.match(html, /indexedDB\.open\(/, '应将目录句柄持久化到 IndexedDB');
  assert.match(html, /loadExportDirHandle\(\)\.then/, '启动时应恢复上次选择的目录');
});

test('不支持选择文件夹时给出明确提示而非静默失败', () => {
  assert.match(
    html,
    /supportsDirectoryPicker\(window\)/,
    '应先探测是否支持目录选择'
  );
  assert.match(html, /不支持选择文件夹/, '不支持时应提示用户');
});

test('导出写入自定义目录，并在无自定义目录时降级为系统下载', () => {
  assert.match(html, /getFileHandle\(fileName, \{ create:true \}\)/, '应写入所选目录');
  assert.match(html, /createWritable\(\)/, '应通过可写流写入文件');
  assert.match(html, /URL\.createObjectURL\(blob\)/, '未选目录时应降级为浏览器下载');
});

test('自定义目录写入失败时提示重新选择，而非静默', () => {
  assert.match(html, /导出失败/, '缺少导出失败提示');
  assert.match(html, /ensureExportDirWritable/, '写入前应先确认/申请写权限');
});
