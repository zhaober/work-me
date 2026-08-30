import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');
const manifest = fs.readFileSync(
  path.join(__dirname, '..', 'WorkMemoApp', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  'utf8'
);

/* ============================================================
   Issue-43：后台不弹通知
   根因与修复：
   1) Android 13+ 必须声明 POST_NOTIFICATIONS 并在「用户手势」内请求，否则不弹窗；
   2) 切回前台时原生通知可能被系统清理，需在 appStateChange 重新登记；
   3) 缺少权限状态展示与「发送测试通知」排查入口。
   ============================================================ */

test('Manifest：显式声明 POST_NOTIFICATIONS（Android 13+ 弹窗前提）', () => {
  assert.ok(
    /<uses-permission\s+android:name="android\.permission\.POST_NOTIFICATIONS"\s*\/>/.test(manifest),
    'AndroidManifest 应声明 POST_NOTIFICATIONS'
  );
});

test('scheduleRecordNotification：仅在校验已授权(checkPermissions)后登记，不在启动期无手势请求权限', () => {
  const m = html.match(/function scheduleRecordNotification\(record\)\{[\s\S]*?\n\}\n/);
  assert.ok(m, '应存在 scheduleRecordNotification 函数');
  const body = m[0];
  assert.ok(/safeLN\('checkPermissions'/.test(body), '调度前应校验权限而非直接请求');
  assert.ok(/safeLN\('schedule'/.test(body), '校验通过后应登记 schedule');
});

test('权限请求被收敛到用户手势路径：requestNotifyPermission 被定义', () => {
  assert.ok(/async function requestNotifyPermission\(\)/.test(html), '应定义 requestNotifyPermission');
  assert.ok(/async function queryNotifyPermission\(\)/.test(html), '应定义 queryNotifyPermission');
});

test('saveRecord 与 scheduleReminder 在用户手势内请求权限', () => {
  assert.ok(/requestNotifyPermission\(\)\.then/.test(html), '保存/设提醒时应调用 requestNotifyPermission');
});

test('前后台切换：注册 appStateChange 重登记原生通知', () => {
  assert.ok(/initAppStateListener\(\)/.test(html), '启动时应注册 appStateChange 监听');
  assert.ok(/Cap\.Plugins\.App\.addListener\('appStateChange'/.test(html), '应监听 appStateChange');
  assert.ok(/if\(state && state\.isActive\)/.test(html), '回到前台(isActive)时应重登记');
});

test('设置页：提供权限状态与「发送测试通知」排查入口', () => {
  assert.ok(/data-notify-permission/.test(html), '应有「通知权限」行');
  assert.ok(/data-notify-test/.test(html), '应有「发送测试通知」行');
  assert.ok(/function sendTestNotification\(\)/.test(html), '应定义 sendTestNotification');
  assert.ok(/id="notifyPermMeta"/.test(html), '应有权限状态文案节点');
});

test('文字颜色设置：保留取色器入口', () => {
  assert.ok(/data-text-color-custom/.test(html), '设置页应保留自定义取色器');
});
