// Issue-25: 提醒功能只挂了一个前台 setTimeout，退到后台/重启即失效，
//   且用户设了时间却收不到提醒闹钟。
// 需求：增加 12306 式多级提醒——到点前每隔一段时间提醒一次，直到距目标 5 分钟前截止，
//   且用系统通知（Notification）+ 震动 + 音效，保证应用不在前台也能收到。
// 修复：
//   1) 纯函数 buildReminderLeads / buildReminderSchedule 生成多级提醒时刻表
//   2) 运行时 scheduleReminder 改为登记多级提醒；armAllReminders 在启动与保存后重建
//   3) fireAlarm 用 Notification + vibrate + 音效 + toast 触发
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_REMINDER_PLAN,
  normalizeReminderPlan,
  formatReminderLabel,
  combineDateTime,
  buildReminderLeads,
  buildReminderSchedule,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');
const MIN = 60000;

/* ---------- DEFAULT_REMINDER_PLAN ---------- */

test('默认提醒方案：提前 3 小时起、每 30 分钟、最晚提前 5 分钟、含到点', () => {
  assert.deepEqual(DEFAULT_REMINDER_PLAN, {
    startMin: 180,
    intervalMin: 30,
    stopMin: 5,
    includeTarget: true,
  });
});

/* ---------- normalizeReminderPlan ---------- */

test('normalizeReminderPlan 缺失/非法字段回落默认值', () => {
  assert.deepEqual(normalizeReminderPlan(undefined), DEFAULT_REMINDER_PLAN);
  assert.deepEqual(normalizeReminderPlan({}), DEFAULT_REMINDER_PLAN);
  assert.deepEqual(normalizeReminderPlan(null), DEFAULT_REMINDER_PLAN);
  // 非法 startMin（<=0）回落默认
  assert.equal(normalizeReminderPlan({ startMin: -5 }).startMin, 180);
  // 非法 intervalMin 回落默认
  assert.equal(normalizeReminderPlan({ intervalMin: 0 }).intervalMin, 30);
  // includeTarget 为布尔时保留
  assert.equal(normalizeReminderPlan({ includeTarget: false }).includeTarget, false);
  assert.equal(normalizeReminderPlan({ includeTarget: true }).includeTarget, true);
});

/* ---------- buildReminderLeads ---------- */

test('buildReminderLeads 默认方案为降序序列并在末尾补齐 stopMin', () => {
  assert.deepEqual(buildReminderLeads(DEFAULT_REMINDER_PLAN), [180, 150, 120, 90, 60, 30, 5]);
});

test('buildReminderLeads 递减未落在 stopMin 时补一次', () => {
  // 60,40,20 都不等于 stopMin(5)，末尾应补 5
  assert.deepEqual(buildReminderLeads({ startMin: 60, intervalMin: 20, stopMin: 5 }), [60, 40, 20, 5]);
});

test('buildReminderLeads 整除到 stopMin 时不重复追加', () => {
  // 60,45,30,15,0 已含 stopMin(0)，不再追加
  assert.deepEqual(buildReminderLeads({ startMin: 60, intervalMin: 15, stopMin: 0 }), [60, 45, 30, 15, 0]);
});

/* ---------- formatReminderLabel ---------- */

test('formatReminderLabel 文案：分钟 / 小时 / 混合', () => {
  assert.equal(formatReminderLabel(0), '时间到');
  assert.equal(formatReminderLabel(-1), '时间到');
  assert.equal(formatReminderLabel(NaN), '时间到');
  assert.equal(formatReminderLabel(5), '还有 5 分钟');
  assert.equal(formatReminderLabel(59), '还有 59 分钟');
  assert.equal(formatReminderLabel(60), '还有 1 小时');
  assert.equal(formatReminderLabel(90), '还有 1 小时 30 分钟');
  assert.equal(formatReminderLabel(121), '还有 2 小时 1 分钟');
  assert.equal(formatReminderLabel(180), '还有 3 小时');
});

/* ---------- combineDateTime ---------- */

test('combineDateTime 合法日期时间组合出本地时间戳', () => {
  const ts = combineDateTime('2026-08-29', '18:30');
  assert.ok(isFinite(ts));
  assert.equal(ts, new Date(2026, 7, 29, 18, 30, 0, 0).getTime());
});

test('combineDateTime 非法日期或时间返回 NaN', () => {
  assert.ok(Number.isNaN(combineDateTime('2026-13-99', '18:30')), '非法月日应返回 NaN');
  assert.ok(Number.isNaN(combineDateTime('2026-08-29', '99:99')), '非法时分应返回 NaN');
  assert.ok(Number.isNaN(combineDateTime(null, null)), '空输入应返回 NaN');
});

/* ---------- buildReminderSchedule ---------- */

test('buildReminderSchedule 默认方案生成多级时刻表（升序、均在现在与目标之间）', () => {
  const target = 1_000_000_000_000; // 固定基准，避免依赖真实时钟
  const now = target - 200 * MIN; // 现在比目标早 200 分钟
  const sch = buildReminderSchedule(target, now, DEFAULT_REMINDER_PLAN);
  assert.equal(sch.length, 8, '7 个提前点 + 1 个到点');
  // 升序
  for (let i = 1; i < sch.length; i++) assert.ok(sch[i].at >= sch[i - 1].at);
  // 每个点在 (now, target] 之内
  sch.forEach((item) => {
    assert.ok(item.at > now, '提醒时刻必须晚于现在');
    assert.ok(item.at <= target, '提醒时刻不晚于目标时刻');
    assert.ok(typeof item.label === 'string' && item.label.length > 0);
  });
  // 最后一个是到点提醒
  assert.equal(sch[sch.length - 1].leadMin, 0);
  assert.equal(sch[sch.length - 1].label, '时间到');
});

test('buildReminderSchedule 只保留仍未来临的点，已过的提前点被过滤', () => {
  const target = 1_000_000_000_000;
  const now = target - 10 * MIN; // 现在比目标早 10 分钟
  const sch = buildReminderSchedule(target, now, DEFAULT_REMINDER_PLAN);
  // 仅 lead=5 仍在未来（target-5min=now+5min），加上到点
  assert.equal(sch.length, 2);
  assert.equal(sch[0].leadMin, 5);
  assert.equal(sch[1].leadMin, 0);
});

test('buildReminderSchedule 目标时刻已过则返回空', () => {
  const target = 1_000_000_000_000;
  const now = target + 1000 * MIN;
  assert.deepEqual(buildReminderSchedule(target, now, DEFAULT_REMINDER_PLAN), []);
});

test('buildReminderSchedule 非法时间戳返回空', () => {
  assert.deepEqual(buildReminderSchedule(NaN, 123, {}), []);
  assert.deepEqual(buildReminderSchedule('x', 1, {}), []);
});

/* ---------- 源码接线 ---------- */

test('import 列表已引入提醒相关纯函数', () => {
  assert.match(html, /DEFAULT_REMINDER_PLAN/, '应导入默认提醒方案');
  assert.match(html, /buildReminderSchedule/, '应导入时刻表生成函数');
  assert.match(html, /combineDateTime/, '应导入日期时间组合函数');
  assert.match(html, /buildReminderLeads/, '应导入提前量序列函数');
});

test('scheduleReminder 已改为多级提醒（不再仅前台 setTimeout）', () => {
  assert.match(html, /function scheduleReminder\(time\)\{[\s\S]*?armReminders\(/, '应调用 armReminders 登记多级提醒');
  assert.match(html, /ensureNotifyPermission\(\)/, '设置提醒时应申请系统通知权限');
});

test('armAllReminders 在启动与保存后重建提醒，保证重启不丢失', () => {
  // INIT 里调用
  assert.match(html, /armAllReminders\(\);/, '启动时应调用 armAllReminders');
  // saveEditor 里调用
  assert.match(html, /saveDB\(\);[\s\S]*?armAllReminders\(\);/, '保存后应重新登记所有提醒');
});

test('fireAlarm 通过系统通知 + 震动 + 音效 + 应用内提示触发', () => {
  assert.match(html, /function fireAlarm\(/, '应存在触发函数');
  assert.match(html, /new Notification\(/, '应使用系统通知（退后台也能收到）');
  assert.match(html, /navigator\.vibrate/, '应使用设备震动');
  assert.match(html, /playSound\('success'\)/, '应播放提醒音效');
});

test('旧的「仅前台单点 setTimeout」实现已被替换', () => {
  assert.ok(
    !html.includes('var parts=time.split'),
    '不应保留旧的字符串解析单点提醒实现'
  );
});
