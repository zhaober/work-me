// Issue-36: 退出应用后无法收到提醒，无法联动系统闹钟
// 修复：集成 @capacitor/local-notifications，保存/删除/启动时调度原生本地通知。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { combineDateTime, notificationIdFor, MAX_NOTIFICATION_ID } from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

test('已安装 @capacitor/local-notifications 依赖', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'WorkMemoApp', 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies && pkg.dependencies['@capacitor/local-notifications']);
});

test('HTML 引用 Capacitor LocalNotifications 插件能力', () => {
  assert.match(html, /(Capacitor|Cap)\.Plugins\.LocalNotifications/);
  assert.match(html, /window\.Capacitor/);
});

test('存在本地通知调度函数', () => {
  assert.match(html, /function initLocalNotifications\(\)/);
  assert.match(html, /function scheduleRecordNotification\(record\)/);
  assert.match(html, /function cancelRecordNotification\(recordId\)/);
  assert.match(html, /function rescheduleAllNotifications\(\)/);
});

test('scheduleRecordNotification 在目标时间已过时不调度', () => {
  const fn = html.substring(
    html.indexOf('function scheduleRecordNotification(record)'),
    html.indexOf('function cancelRecordNotification')
  );
  assert.match(fn, /if\(!isFinite\(target\)\s*\|\|\s*target\s*<=\s*Date\.now\(\)\)\s*return\s*false/);
});

test('saveEditor 保存记录后调用 scheduleRecordNotification', () => {
  const fn = html.substring(
    html.indexOf('function saveEditor()'),
    html.indexOf('function deleteCurrentRecord')
  );
  assert.match(fn, /scheduleRecordNotification\(DB\.records\[editing\.id\]\)/);
});

test('deleteCurrentRecord 删除前先调用 cancelRecordNotification', () => {
  const fn = html.substring(
    html.indexOf('function deleteCurrentRecord()'),
    html.indexOf('/* ============ REMINDER')
  );
  assert.match(fn, /cancelRecordNotification\(rid\)/);
});

test('启动流程 bootstrapStore 成功后调用 rescheduleAllNotifications', () => {
  assert.match(html, /rescheduleAllNotifications\(\)/);
  // Issue-37 起：通知调度改为延后一拍并包 try/catch，
  // 且必须先置 markBootOk() 再调度——插件异常不能拖住首屏，也不能被误判为启动失败
  assert.match(
    html,
    /markBootOk\(\);\s*\/\*[\s\S]{0,120}?\*\/\s*setTimeout\(\s*function\(\s*\)\s*\{\s*try\s*\{\s*rescheduleAllNotifications\(\);\s*\}\s*catch/,
    '通知调度应延后执行且受保护'
  );
});

test('recordNotifyId 把任意记录 id 映射到可用的 32 位正整数区间', () => {
  // 实现已收敛到 app-core 的 notificationIdFor，此处验证行为而非实现方式
  const fn = html.substring(
    html.indexOf('function recordNotifyId(recordId)'),
    html.indexOf('function scheduleRecordNotification')
  );
  assert.match(fn, /return notificationIdFor\(recordId\);/);

  for (const id of ['rec-001', 'r', 'x'.repeat(300), '中文记录', 42]) {
    const n = notificationIdFor(id);
    assert.ok(Number.isInteger(n) && n > 0 && n <= MAX_NOTIFICATION_ID, `${id} -> ${n} 越界`);
    assert.strictEqual(n, notificationIdFor(id), '同一 id 必须稳定派生');
  }
});

test('combineDateTime 正确处理 HH:MM 与日期', () => {
  const t = combineDateTime('2026-08-29', '14:30');
  const d = new Date(t);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth() + 1, 8);
  assert.equal(d.getDate(), 29);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
});
