import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRASH_LOG_KEY, buildCrashReport, BOOT_STAGES } from '../src/app-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'work-memo-app.html'), 'utf8');
const manifest = fs.readFileSync(
  path.join(ROOT, 'WorkMemoApp', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  'utf8'
);

/* 经典脚本（崩溃捕获）必须位于 module 脚本之前：
   module 脚本加载失败时只有先注册的经典脚本能捕获到错误 */
const crashScriptEnd = html.indexOf('</script>', html.indexOf('__WM_STAGE__'));
const moduleScriptStart = html.indexOf('<script type="module">');

test('崩溃捕获脚本位于 module 脚本之前', () => {
  assert.ok(crashScriptEnd > 0, '未找到崩溃捕获脚本');
  assert.ok(moduleScriptStart > 0, '未找到 module 脚本');
  assert.ok(
    crashScriptEnd < moduleScriptStart,
    '崩溃捕获脚本必须在 module 脚本之前，否则捕获不到模块加载失败'
  );
});

test('崩溃捕获脚本是经典脚本，不是 module', () => {
  const crashScript = html.slice(0, crashScriptEnd);
  assert.ok(
    !/type\s*=\s*["']module["']/.test(crashScript.slice(crashScript.lastIndexOf('<script'))),
    '崩溃捕获必须是经典脚本（module 脚本自身出错时无法自捕获）'
  );
});

test('捕获 window error 与 unhandledrejection 两类致命错误', () => {
  const crashScript = html.slice(0, crashScriptEnd);
  assert.match(crashScript, /addEventListener\(\s*['"]error['"]/, '未监听 error 事件');
  assert.match(crashScript, /unhandledrejection/, '未监听 unhandledrejection');
});

test('error 监听使用捕获阶段，能捕获资源加载失败', () => {
  const crashScript = html.slice(0, crashScriptEnd);
  assert.match(
    crashScript,
    /addEventListener\(\s*['"]error['"]\s*,\s*function[\s\S]{0,400}?\}\s*,\s*true\s*\)/,
    'error 监听需传 true 走捕获阶段，才能捕获 src/href 资源加载失败'
  );
});

test('崩溃日志写入 localStorage 专用 key 并可读取/清除', () => {
  const crashScript = html.slice(0, crashScriptEnd);
  assert.ok(crashScript.includes(CRASH_LOG_KEY), '崩溃脚本未使用 CRASH_LOG_KEY 常量对应的 key');
  assert.match(crashScript, /__wmReadCrash/, '缺少读取接口');
  assert.match(crashScript, /__wmClearCrash/, '缺少清除接口');
});

test('存在看门狗：启动超时仍未标记成功则展示错误面板', () => {
  const crashScript = html.slice(0, crashScriptEnd);
  assert.match(crashScript, /__WM_BOOT_OK__/, '缺少启动成功标记');
  assert.match(crashScript, /setTimeout\(/, '缺少看门狗定时器');
});

test('存在错误面板 DOM 与复制/清除/重试入口', () => {
  assert.match(html, /id\s*=\s*["']crashPanel["']/, '缺少崩溃面板容器');
  const panelStart = html.indexOf('id="crashPanel"');
  const panel = html.slice(panelStart, panelStart + 1600);
  assert.match(panel, /data-crash-copy/, '缺少「复制错误」入口');
  assert.match(panel, /data-crash-clear/, '缺少「清除并重试」入口');
  assert.match(panel, /id\s*=\s*["']crashDetail["']/, '缺少错误详情容器');
});

test('module 内按阶段推进启动标记，便于定位卡在哪一步', () => {
  assert.match(html, /__WM_STAGE__\s*=\s*['"]module-loaded['"]/, '缺少 module 加载标记');
  assert.match(html, /markBootStage\(\s*['"]store-loading['"]\s*\)/, '存储载入前未标记阶段');
  assert.match(html, /__WM_STAGE__\s*=\s*['"]rendered['"]/, '缺少渲染完成标记');
  assert.match(html, /__WM_BOOT_OK__\s*=\s*true/, '启动成功未置位 __WM_BOOT_OK__');
  /* 存储载入失败也要置位成功标记：App 用降级数据继续可用，不能卡在白屏 */
  const initStart = html.indexOf('markBootStage(\'store-loading\')');
  const initBlock = html.slice(initStart, html.indexOf('</script>', initStart));
  assert.match(initBlock, /catch[\s\S]*?markBootOk\(\)/, '存储异常分支未标记启动完成，会误报崩溃面板');
});

test('rescheduleAllNotifications 整体受 try/catch 保护', () => {
  const fnStart = html.indexOf('async function rescheduleAllNotifications');
  const endAt = html.indexOf('function initAppStateListener', fnStart);
  // 锚点必须显式校验：indexOf 找不到时返回 -1，slice 会一路截到别处，
  // 导致断言「看起来通过」实则什么都没测（多图改造删掉旧锚点后踩过这个坑）。
  assert.ok(fnStart >= 0 && endAt > fnStart, '未定位到函数区间，边界锚点可能已失效');
  const fn = html.slice(fnStart, endAt);
  assert.match(fn, /try\s*\{/, 'rescheduleAllNotifications 缺少 try');
  assert.match(fn, /catch/, 'rescheduleAllNotifications 缺少 catch');
});

test('AndroidManifest 声明精确闹钟所需权限', () => {
  assert.match(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/, '缺少 SCHEDULE_EXACT_ALARM');
});

/* ---------- 纯函数行为测试 ---------- */

test('buildCrashReport 展开脚本错误的完整信息', () => {
  const rec = {
    kind: 'error',
    message: 'noteDB is not defined',
    stack: 'ReferenceError: noteDB is not defined\n    at init (index.html:700)',
    at: '2026-08-30T08:00:00.000Z',
    ua: 'Mozilla/5.0 (Linux; Android 14)',
  };
  const r = buildCrashReport(rec, 'store-loading');
  assert.ok(r, '应返回报告对象');
  assert.match(r.title, /脚本错误/);
  assert.match(r.detail, /noteDB is not defined/);
  assert.match(r.detail, /store-loading/, '应包含所处阶段');
  assert.match(r.detail, /at init/, '应包含堆栈');
});

test('buildCrashReport 区分 Promise 异常与资源加载失败', () => {
  const p = buildCrashReport({ kind: 'promise', message: 'boom', stack: '' }, 'rendered');
  assert.match(p.title, /Promise/);
  const res = buildCrashReport({ kind: 'resource', message: '加载失败: src/app-core.js' }, 'module-loaded');
  assert.match(res.title, /资源/);
  assert.match(res.detail, /app-core\.js/);
});

test('buildCrashReport 无崩溃记录时给出「启动未完成」提示', () => {
  const r = buildCrashReport(null, 'store-loading');
  assert.ok(r);
  assert.match(r.title, /启动未完成/);
  assert.match(r.detail, /store-loading/);
});

test('buildCrashReport 对脏数据不抛异常', () => {
  assert.doesNotThrow(() => buildCrashReport(undefined, undefined));
  assert.doesNotThrow(() => buildCrashReport('garbage', 'x'));
  assert.doesNotThrow(() => buildCrashReport({}, null));
  const r = buildCrashReport('garbage', 'x');
  assert.ok(r && typeof r.detail === 'string');
});

test('BOOT_STAGES 覆盖启动全链路', () => {
  assert.ok(Array.isArray(BOOT_STAGES), 'BOOT_STAGES 应为数组');
  ['html-parsed', 'module-loaded', 'store-loading', 'rendered'].forEach((s) => {
    assert.ok(BOOT_STAGES.includes(s), 'BOOT_STAGES 缺少阶段：' + s);
  });
});

test('CRASH_LOG_KEY 与业务数据 key 不冲突', () => {
  assert.ok(CRASH_LOG_KEY && typeof CRASH_LOG_KEY === 'string');
  assert.ok(!CRASH_LOG_KEY.includes('records'), '崩溃日志不应与业务数据共用 key');
  assert.match(CRASH_LOG_KEY, /^work-memo-/);
});
