import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOT_STORE_TIMEOUT,
  BOOT_WATCHDOG_DELAY,
  BOOT_TIMEOUT_SENTINEL,
  isBootTimeout,
  raceTimeout,
} from '../src/app-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ---------- 纯函数行为测试 ---------- */

test('raceTimeout：永不兑现的 Promise 在超时后以哨兵值兑现', async () => {
  const hung = new Promise(() => {}); // 既不 resolve 也不 reject
  const r = await raceTimeout(hung, 30, BOOT_TIMEOUT_SENTINEL);
  assert.strictEqual(r, BOOT_TIMEOUT_SENTINEL, '挂起的 Promise 应被超时兜底');
});

test('raceTimeout：正常兑现时返回真实结果，不返回哨兵', async () => {
  const r = await raceTimeout(Promise.resolve('loaded'), 50, BOOT_TIMEOUT_SENTINEL);
  assert.strictEqual(r, 'loaded');
  assert.ok(!isBootTimeout(r));
});

test('raceTimeout：原 Promise 抛错时错误照常向外传播', async () => {
  await assert.rejects(
    () => raceTimeout(Promise.reject(new Error('db broken')), 50, BOOT_TIMEOUT_SENTINEL),
    /db broken/,
    '超时兜底不能吞掉真实的存储异常'
  );
});

test('raceTimeout：慢但正常的 Promise 只要在超时内完成就不会被误判', async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve('slow-ok'), 40));
  const r = await raceTimeout(slow, 300, BOOT_TIMEOUT_SENTINEL);
  assert.strictEqual(r, 'slow-ok');
});

test('isBootTimeout 只对哨兵值成立', () => {
  assert.strictEqual(isBootTimeout(BOOT_TIMEOUT_SENTINEL), true);
  assert.strictEqual(isBootTimeout('loaded'), false);
  assert.strictEqual(isBootTimeout(undefined), false);
  assert.strictEqual(isBootTimeout(0), false);
});

test('超时与看门狗的时长关系正确：看门狗必须晚于存储超时', () => {
  assert.ok(
    BOOT_WATCHDOG_DELAY > BOOT_STORE_TIMEOUT,
    '看门狗若早于存储超时，会在降级完成前误弹错误面板'
  );
  assert.ok(BOOT_STORE_TIMEOUT >= 1000, '存储超时过短会让正常设备被误降级');
  assert.ok(BOOT_STORE_TIMEOUT <= 15000, '存储超时过长会让用户等太久');
});

/* ---------- 接线测试 ---------- */

test('启动链路用 raceTimeout 包住 bootstrapStore', () => {
  assert.match(
    html,
    /raceTimeout\(bootstrapStore\(\),\s*BOOT_STORE_TIMEOUT,\s*BOOT_TIMEOUT_SENTINEL\)/,
    'bootstrapStore 未加超时兜底：IndexedDB 挂起时会永远停在空白页'
  );
});

test('超时分支降级到本地存储并阻止迟到回填', () => {
  const start = html.indexOf('if(isBootTimeout(result)){');
  assert.ok(start > 0, '缺少超时处理分支');
  const block = html.slice(start, start + 700);
  assert.match(block, /STORAGE_MODE\s*=\s*'ls'/, '超时后未降级到本地存储');
  assert.match(block, /loadFromLocalStorage\(\)/, '超时后未读取本地存储兜底数据');
  assert.match(block, /storeBootAborted\s*=\s*true/, '未阻止存储层迟到结果覆盖已渲染数据');
  assert.match(block, /__wmSaveCrash/, '超时未留档，后续无法排查');
});

test('applyDbShape 受 storeBootAborted 保护', () => {
  const fn = html.slice(
    html.indexOf('function applyDbShape('),
    html.indexOf('async function hydrateRecordImage')
  );
  assert.match(fn, /if\(storeBootAborted\)\s*return/, '迟到的存储结果会覆盖已渲染数据');
});

test('看门狗延迟与 BOOT_WATCHDOG_DELAY 常量一致', () => {
  /* 经典脚本无法 import 常量，只能写字面量；这里断言两者不漂移 */
  const m = html.match(/__wmShowCrash\(\);\s*\},\s*(\d+)\)/);
  assert.ok(m, '未找到看门狗定时器');
  assert.strictEqual(
    Number(m[1]),
    BOOT_WATCHDOG_DELAY,
    '经典脚本中的看门狗延迟与 app-core 常量不一致'
  );
});
