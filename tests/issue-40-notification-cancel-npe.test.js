import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_NOTIFICATION_ID,
  notificationIdFor,
  isValidNotificationId,
  buildCancelPayload,
  shouldCallCancel,
} from '../src/app-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');
const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-core.js'), 'utf8');

/* ============================================================
   Issue-40：启动即闪退 —— LocalNotifications.cancel({}) 触发 Java 层 NPE
   堆栈：
     LocalNotificationsPlugin.cancel → LocalNotificationManager.cancel
     → LocalNotification.getLocalNotificationPendingList
     → JSArray.toList() on a null object reference
   发生线程：CapacitorPlugins（Java 线程），JS 的 try/catch 与 .catch() 均无法拦截
   ============================================================ */

/* ---------- 通知 id 派生 ---------- */

test('notificationIdFor：同一记录 id 必须稳定派生出同一个通知 id', () => {
  assert.strictEqual(notificationIdFor('rec-001'), notificationIdFor('rec-001'));
  assert.strictEqual(notificationIdFor(42), notificationIdFor(42));
});

test('notificationIdFor：结果恒落在 1..MAX_NOTIFICATION_ID 内（0 会使插件视为未设置）', () => {
  const samples = ['a', 'rec-001', 'rec-002', 'x'.repeat(500), '0', '-1', '999999999', '中文字段'];
  for (const s of samples) {
    const id = notificationIdFor(s);
    assert.ok(Number.isInteger(id), `${s} 应派生出整数，实际 ${id}`);
    assert.ok(id >= 1 && id <= MAX_NOTIFICATION_ID, `${s} 的 id=${id} 越界`);
  }
});

test('notificationIdFor：空值派生为 0，交由 isValidNotificationId 拦截', () => {
  assert.strictEqual(notificationIdFor(''), 0);
  assert.strictEqual(notificationIdFor(null), 0);
  assert.strictEqual(notificationIdFor(undefined), 0);
});

test('MAX_NOTIFICATION_ID 为 32 位正整数上限内可用值', () => {
  assert.strictEqual(MAX_NOTIFICATION_ID, 2147483646);
  assert.ok(MAX_NOTIFICATION_ID < 2147483647, '须小于 Integer.MAX_VALUE 以留出安全边界');
});

/* ---------- id 合法性校验 ---------- */

test('isValidNotificationId：拒绝 0、负数、越界、非整数、NaN', () => {
  for (const bad of [0, -1, -2147483646, MAX_NOTIFICATION_ID + 1, 2147483647, 1.5, NaN, Infinity]) {
    assert.strictEqual(isValidNotificationId(bad), false, `${bad} 不应被判为合法`);
  }
});

test('isValidNotificationId：接受 1 与上限值', () => {
  assert.strictEqual(isValidNotificationId(1), true);
  assert.strictEqual(isValidNotificationId(MAX_NOTIFICATION_ID), true);
});

/* ---------- cancel 载荷构造（崩溃的直接防线） ---------- */

test('buildCancelPayload：pending 缺失或 notifications 非数组时返回 null', () => {
  assert.strictEqual(buildCancelPayload(null), null);
  assert.strictEqual(buildCancelPayload(undefined), null);
  assert.strictEqual(buildCancelPayload({}), null);
  assert.strictEqual(buildCancelPayload({ notifications: 'oops' }), null);
});

test('buildCancelPayload：空列表返回 null（无通知可取消时必须跳过 cancel 调用）', () => {
  assert.strictEqual(buildCancelPayload({ notifications: [] }), null);
});

test('buildCancelPayload：过滤掉非法 id，全非法时返回 null', () => {
  assert.strictEqual(buildCancelPayload({ notifications: [{ id: 0 }, { id: -3 }, { id: 2147483647 }] }), null);
  assert.strictEqual(buildCancelPayload({ notifications: [null, {}, { id: 'x' }] }), null);
});

test('buildCancelPayload：保留合法 id 并按 id 去重', () => {
  const payload = buildCancelPayload({
    notifications: [{ id: 7 }, { id: 7 }, { id: 9 }, { id: 0 }, { id: 12 }],
  });
  assert.deepStrictEqual(payload, { notifications: [{ id: 7 }, { id: 9 }, { id: 12 }] });
});

test('shouldCallCancel：只有非空 notifications 才允许下发 cancel', () => {
  assert.strictEqual(shouldCallCancel({ notifications: [{ id: 1 }] }), true);
  assert.strictEqual(shouldCallCancel(null), false);
  assert.strictEqual(shouldCallCancel({ notifications: [] }), false);
  assert.strictEqual(shouldCallCancel({}), false);
});

/* ---------- 源码静态断言：确保崩溃写法不再出现 ---------- */

test('HTML 中不再出现 cancel 空对象调用（崩溃根因）', () => {
  assert.ok(
    !/\.cancel\(\s*\{\s*\}\s*\)/.test(html),
    'cancel({}) 会让插件拿到 null 的 JSArray 并在 Java 线程 NPE 杀进程'
  );
});

test('cancelAllRecordNotifications 改为先 getPending 再构造载荷', () => {
  const seg = html.slice(html.indexOf('function cancelAllRecordNotifications'), html.indexOf('async function rescheduleAllNotifications'));
  assert.ok(seg.length > 0, '应能截取到 cancelAllRecordNotifications 函数体');
  assert.match(seg, /getPending\s*\(/, '必须先读取待发列表');
  assert.match(seg, /buildCancelPayload\s*\(\s*pending\s*\)/, '必须用纯函数构造载荷');
  assert.match(seg, /shouldCallCancel\s*\(\s*payload\s*\)/, '必须在下发前做非空守卫');
  assert.ok(!/\.cancel\(\s*\{\s*\}\s*\)/.test(seg), '函数体内不得残留空 cancel');
});

test('cancelAllRecordNotifications 在 getPending 不可用时直接放弃，而不是退化为空 cancel', () => {
  const seg = html.slice(html.indexOf('function cancelAllRecordNotifications'), html.indexOf('async function rescheduleAllNotifications'));
  assert.match(
    seg,
    /typeof\s+LN\.getPending\s*!==\s*['"]function['"][\s\S]{0,60}?return\s+Promise\.resolve\(false\)/,
    '插件不支持 getPending 时应安全跳过，而非回退到危险的 cancel({})'
  );
});

test('schedule / cancel 单条通知前都做 id 合法性校验', () => {
  const sched = html.slice(html.indexOf('function scheduleRecordNotification'), html.indexOf('function cancelRecordNotification'));
  assert.match(sched, /isValidNotificationId\s*\(\s*nid\s*\)/, '调度前必须校验 id');

  const one = html.slice(html.indexOf('function cancelRecordNotification'), html.indexOf('function cancelAllRecordNotifications'));
  assert.match(one, /isValidNotificationId\s*\(\s*nid\s*\)/, '取消单条前必须校验 id');
});

test('recordNotifyId 复用 app-core 的 notificationIdFor，保持两处语义一致', () => {
  assert.match(
    html,
    /function recordNotifyId\(recordId\)\s*\{\s*return notificationIdFor\(recordId\);\s*\}/,
    'id 派生必须收敛到被测纯函数'
  );
});

test('HTML 已引入本次新增的四个安全函数', () => {
  const imp = html.match(/import \{[\s\S]*?\} from '\.\/src\/app-core\.js';/);
  assert.ok(imp, '应存在 app-core 的 import 语句');
  for (const name of ['MAX_NOTIFICATION_ID', 'notificationIdFor', 'isValidNotificationId', 'buildCancelPayload', 'shouldCallCancel']) {
    assert.ok(imp[0].includes(name), `import 中缺少 ${name}`);
  }
});

test('app-core.js 导出本次新增的四个安全函数', () => {
  for (const name of ['MAX_NOTIFICATION_ID', 'notificationIdFor', 'isValidNotificationId', 'buildCancelPayload', 'shouldCallCancel']) {
    assert.match(core, new RegExp(`export (const|function) ${name}\\b`), `app-core 应导出 ${name}`);
  }
});

test('rescheduleAllNotifications 的 JS 层 try/catch 仍然保留（对 Web 层异常有效）', () => {
  const seg = html.slice(html.indexOf('async function rescheduleAllNotifications'), html.indexOf('async function rescheduleAllNotifications') + 1200);
  assert.match(seg, /try\s*\{/, '仍需要 try 兜住 JS 侧异常');
  assert.match(seg, /catch\s*\(\s*e\s*\)\s*\{/, '仍需 catch');
});
