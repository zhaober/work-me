import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 注入 localStorage shim，使纯函数可在 Node 下读写
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const {
  PLUGIN_CALL_KEY,
  markPluginCall,
  clearPluginCall,
  readUnfinishedPluginCall,
  buildPluginCrashHint,
} = await import('../src/app-core.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');
const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-core.js'), 'utf8');

/* ============================================================
   Issue-41：原生插件调用看门狗
   背景：Capacitor 插件在独立 Java 线程执行，异常会直接杀进程，
   而该 Promise 永不 reject —— JS 的 try/catch / .catch 都拦不住。
   对策：插件调用前 mark，成功后 clear；若进程在回调前被杀，
   残留标记下次启动被转成崩溃面板里的可见线索。
   ============================================================ */

/* ---------- 纯函数行为 ---------- */

test('markPluginCall 写入标记，clearPluginCall 清除', () => {
  delete store[PLUGIN_CALL_KEY];
  markPluginCall('LocalNotifications', 'cancel');
  const raw = localStorage.getItem(PLUGIN_CALL_KEY);
  assert.ok(raw, '应写入标记');
  const rec = JSON.parse(raw);
  assert.strictEqual(rec.plugin, 'LocalNotifications');
  assert.strictEqual(rec.method, 'cancel');
  assert.ok(typeof rec.at === 'string' && rec.at, '应带时间戳');

  clearPluginCall();
  assert.strictEqual(localStorage.getItem(PLUGIN_CALL_KEY), null, '清除后标记应消失');
});

test('readUnfinishedPluginCall：清除后应返回 null', () => {
  delete store[PLUGIN_CALL_KEY];
  markPluginCall('LocalNotifications', 'schedule');
  assert.ok(readUnfinishedPluginCall(), '有残留时应读出');
  clearPluginCall();
  assert.strictEqual(readUnfinishedPluginCall(), null, '清除后读取应为 null');
});

test('readUnfinishedPluginCall：标记损坏时返回 null 而不抛', () => {
  localStorage.setItem(PLUGIN_CALL_KEY, '{not json');
  assert.strictEqual(readUnfinishedPluginCall(), null);
  localStorage.setItem(PLUGIN_CALL_KEY, JSON.stringify({ plugin: '' }));
  assert.strictEqual(readUnfinishedPluginCall(), null, '缺 method 应视为无效');
  delete store[PLUGIN_CALL_KEY];
});

test('buildPluginCrashHint：由残留标记构造可读的崩溃线索', () => {
  const rec = { plugin: 'LocalNotifications', method: 'cancel', at: '2026-08-30T19:42:50Z' };
  const hint = buildPluginCrashHint(rec);
  assert.ok(hint, '应有线索');
  assert.strictEqual(hint.kind, 'plugin');
  assert.match(hint.message, /LocalNotifications\.cancel/);
  assert.match(hint.stack, /Java 线程/, '应点明崩溃发生在 Java 线程');
  assert.match(hint.stack, /adb logcat/, '应给出下一步取证指引');
  assert.strictEqual(buildPluginCrashHint(null), null);
  assert.strictEqual(buildPluginCrashHint({ plugin: '', method: '' }), null);
});

test('PLUGIN_CALL_KEY 与经典脚本里使用的字面量必须一致', () => {
  // 经典脚本在 module 之前无法 import，使用硬编码字面量，二者必须同源
  assert.match(html, new RegExp("localStorage\\.getItem\\('" + PLUGIN_CALL_KEY + "'\\)"),
    '经典脚本应读取同一个键');
});

/* ---------- 源码静态断言：所有 LN.* 危险调用必须经 safeLN ---------- */

test('app-core 导出看门狗相关纯函数', () => {
  for (const name of ['PLUGIN_CALL_KEY', 'markPluginCall', 'clearPluginCall', 'readUnfinishedPluginCall', 'buildPluginCrashHint']) {
    assert.match(core, new RegExp(`export (const|function) ${name}\\b`), `app-core 应导出 ${name}`);
  }
});

test('LN 的危险方法不再被裸调用，统一走 safeLN', () => {
  assert.strictEqual(
    (html.match(/\bLN\.(cancel|schedule|requestPermissions|getPending)\s*\(/g) || []).length,
    0,
    '每个插件调用都必须经 safeLN 包装以留痕'
  );
});

test('存在 safeLN 包装函数，且调用前 mark、成功后 clear', () => {
  const seg = html.slice(html.indexOf('function safeLN('), html.indexOf('function safeLN(') + 600);
  assert.match(seg, /markPluginCall\(['"]LocalNotifications['"],\s*method\)/, '调用前必须 mark');
  assert.match(seg, /clearPluginCall\(\)/, '成功或失败后必须清标记');
  assert.match(seg, /\.then\(function\(r\)\{ clearPluginCall\(\); return r; \}\)/, 'resolve 后清除');
});

test('scheduleRecordNotification 通过 safeLN 发起 requestPermissions 与 schedule', () => {
  const seg = html.slice(html.indexOf('function scheduleRecordNotification'), html.indexOf('function cancelRecordNotification'));
  assert.match(seg, /safeLN\('requestPermissions',\s*\[\]\)/);
  assert.match(seg, /safeLN\('schedule',\s*\[/);
});

test('cancelRecordNotification 通过 safeLN 发起 cancel', () => {
  const seg = html.slice(html.indexOf('function cancelRecordNotification'), html.indexOf('function cancelAllRecordNotifications'));
  assert.match(seg, /safeLN\('cancel',\s*\[\{ notifications:/);
});

test('cancelAllRecordNotifications：getPending 与 cancel 均经 safeLN', () => {
  const seg = html.slice(html.indexOf('function cancelAllRecordNotifications'), html.indexOf('async function rescheduleAllNotifications'));
  assert.match(seg, /safeLN\('getPending',\s*\[\]\)/);
  assert.match(seg, /safeLN\('cancel',\s*\[payload\]\)/);
});

test('经典脚本的看门狗会消费残留标记并写入崩溃日志', () => {
  const seg = html.slice(html.indexOf('checkPluginCallWatchdog'), html.indexOf('checkPluginCallWatchdog') + 600);
  assert.match(seg, /localStorage\.getItem\('workmemo-plugin-call'\)/, '读取残留标记');
  assert.match(seg, /save\('plugin',/, '转为可见崩溃线索');
  assert.match(seg, /Capacitor 插件在独立的 Java 线程执行/, '说明崩溃机制');
});

test('HTML import 含看门狗相关函数', () => {
  const imp = html.match(/import \{[\s\S]*?\} from '\.\/src\/app-core\.js';/);
  assert.ok(imp, '应存在 app-core 的 import');
  for (const name of ['PLUGIN_CALL_KEY', 'markPluginCall', 'clearPluginCall', 'readUnfinishedPluginCall', 'buildPluginCrashHint']) {
    assert.ok(imp[0].includes(name), `import 缺少 ${name}`);
  }
});

test('rescheduleAllNotifications 的 Web 层 try/catch 仍保留', () => {
  const seg = html.slice(html.indexOf('async function rescheduleAllNotifications'), html.indexOf('async function rescheduleAllNotifications') + 400);
  assert.match(seg, /try\s*\{[\s\S]{0,80}?await cancelAllRecordNotifications/);
  assert.match(seg, /catch\s*\(e\)\s*\{/, '仍需 catch 兜住 JS 侧异常');
});
