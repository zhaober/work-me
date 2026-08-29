// Issue-21: 导出数据后没有告知具体文件位置
// 原实现：exportData 只 toast「已导出 JSON 文件」，用户不知道文件存到了哪里、
// 叫什么名字。文件名还是硬编码的『工作计划与复盘-导出.json』，多次导出互相覆盖。
// 修复：
//   1) buildExportFilename 生成带日期的文件名，避免覆盖
//   2) describeExportLocation 生成落地位置说明（自定义目录给完整路径，否则给各平台默认下载目录）
//   3) openNoticeModal 弹出明确告知（仅「确定」，不像确认框那样有「取消」）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildExportFilename,
  describeExportLocation,
  sanitizeFileName,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ---------- 纯函数：文件名 ---------- */

test('buildExportFilename 生成「名称-日期.扩展名」', () => {
  assert.equal(
    buildExportFilename('工作计划与复盘-导出', '2026-08-29', 'json'),
    '工作计划与复盘-导出-2026-08-29.json'
  );
});

test('buildExportFilename 日期非法时省略日期段', () => {
  assert.equal(buildExportFilename('导出', '2026/08/29', 'json'), '导出.json');
  assert.equal(buildExportFilename('导出', '', 'json'), '导出.json');
  assert.equal(buildExportFilename('导出', null, 'json'), '导出.json');
});

test('buildExportFilename 清理非法文件名字符', () => {
  // Windows / Android 保留字符不能出现在文件名中
  assert.equal(sanitizeFileName('a/b:c*d?e"f<g>h|i'), 'a-b-c-d-e-f-g-h-i');
  assert.equal(buildExportFilename('a/b', '2026-01-01', '.json'), 'a-b-2026-01-01.json');
});

test('buildExportFilename base 缺失时回退为「导出」', () => {
  assert.equal(buildExportFilename('', '2026-01-01', 'json'), '导出-2026-01-01.json');
  assert.equal(buildExportFilename(null, '2026-01-01', 'json'), '导出-2026-01-01.json');
});

/* ---------- 纯函数：落地位置描述 ---------- */

test('describeExportLocation 无自定义目录时说明系统下载目录 + 文件名', () => {
  const info = describeExportLocation('工作计划与复盘-导出-2026-08-29.json', null);
  assert.equal(info.hasCustomDir, false);
  assert.equal(info.path, null);
  assert.match(info.message, /下载/, '应说明落到「下载」目录');
  assert.ok(
    info.message.includes('工作计划与复盘-导出-2026-08-29.json'),
    '应包含具体文件名'
  );
  // 手机与电脑分别给出查找路径
  assert.match(info.message, /文件管理/, '应给出手机端查找路径');
  assert.match(info.message, /电脑/, '应给出电脑端查找路径');
});

test('describeExportLocation 有自定义目录时给出完整路径', () => {
  const info = describeExportLocation('导出.json', '/sdcard/Download');
  assert.equal(info.hasCustomDir, true);
  assert.equal(info.path, '/sdcard/Download/导出.json');
  assert.ok(info.message.includes('/sdcard/Download/导出.json'), '应包含完整路径');
});

test('describeExportLocation 规范化目录尾部多余斜杠', () => {
  assert.equal(describeExportLocation('a.json', '/sdcard/Download//').path, '/sdcard/Download/a.json');
  assert.equal(describeExportLocation('a.json', '下载备份/').path, '下载备份/a.json');
});

test('describeExportLocation 文件名缺省时给出兜底名', () => {
  const info = describeExportLocation(null, null);
  assert.ok(info.message.includes('导出文件'));
});

/* ---------- 源码接线：导出流程必须调用这些函数 ---------- */

test('exportData 使用 buildExportFilename 生成文件名', () => {
  assert.match(
    html,
    /buildExportFilename\(/,
    'exportData 应调用 buildExportFilename 生成带日期的文件名'
  );
  // 不得再硬编码旧文件名
  assert.ok(
    !html.includes("a.download='工作计划与复盘-导出.json'"),
    '不应再使用硬编码的导出文件名（多次导出会互相覆盖）'
  );
});

test('exportData 调用 describeExportLocation 并弹窗告知位置', () => {
  assert.match(html, /describeExportLocation\(/, 'exportData 应调用 describeExportLocation');
  assert.match(html, /openNoticeModal\('导出成功'/, '导出成功后应弹窗告知保存位置');
});

test('openNoticeModal 隐藏「取消」且 closeModal 恢复显示', () => {
  // 通知型弹窗只有「确定」；关闭后必须恢复「取消」，否则后续确认框少一个按钮
  assert.match(
    html,
    /function openNoticeModal[\s\S]{0,400}modalCancel'\)\.style\.display='none'/,
    '打开通知弹窗时应隐藏「取消」按钮'
  );
  assert.match(
    html,
    /function closeModal\(\)\{[^}]*modalCancel'\)\.style\.display=''/,
    '关闭弹窗时应恢复「取消」按钮显示'
  );
});
