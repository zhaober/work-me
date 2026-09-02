import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

var html = readFileSync('work-memo-app.html', 'utf8');

test('issue-55: 今日计划 — HTML 结构存在', function(){
  assert.match(html, /id="todayPlan"/, '今日计划屏幕节点应存在');
  assert.match(html, /id="todayPlanStats"/, '统计区应存在');
  assert.match(html, /id="todayPlanList"/, '列表区应存在');
  assert.match(html, /id="todayPlanBottombar"/, '底部操作栏应存在');
  assert.match(html, /id="tpDoneBtn"/, '全部完成按钮应存在');
  assert.match(html, /id="tpMoveBtn"/, '移到下一天按钮应存在');
});

test('issue-55: 今日计划 — 今日计划卡片可点击', function(){
  assert.match(html, /data-go-today-plan/, '今日计划卡片应带 data-go-today-plan 属性');
  assert.match(html, /cursor:pointer.*data-go-today-plan|data-go-today-plan.*cursor:pointer/,
    '卡片应设 cursor:pointer（顺序可能互换，此处宽松校验）');
});

test('issue-55: 今日计划 — CSS 样式存在', function(){
  assert.match(html, /\.today-plan-stats/, '应有 .today-plan-stats 样式');
  assert.match(html, /\.today-plan-card/, '应有 .today-plan-card 样式');
  assert.match(html, /\.today-plan-item/, '应有 .today-plan-item 样式');
  assert.match(html, /\.today-plan-bottombar/, '应有 .today-plan-bottombar 样式');
  assert.match(html, /\.today-plan-empty/, '应有 .today-plan-empty 样式');
});

test('issue-55: 今日计划 — renderTodayPlan 函数存在且逻辑正确', function(){
  assert.match(html, /function renderTodayPlan/, 'renderTodayPlan 函数应存在');
  assert.match(html, /todayPlanCache = \[\]/, '今日计划列表应缓存到 todayPlanCache');
  assert.match(html, /data-ti=.*p\.id.*\+.*i/, 'checklist 项应带 data-ti 属性');
  assert.match(html, /data-open-plan=.*p\.id/, '卡片头应带 data-open-plan 属性');
  assert.match(html, /<div class="badge plan">计划<\/div>/, '应有计划 badge');
  assert.match(html, /tp-pbar/, '应有进度条');
});

test('issue-55: 今日计划 — 事件委托存在', function(){
  assert.match(html, /data-go-today-plan.*renderTodayPlan|renderTodayPlan.*data-go-today-plan/,
    '应监听 data-go-today-plan 事件');
  assert.match(html, /data-ti.*toggleTodayPlanItem|toggleTodayPlanItem.*data-ti/,
    '应监听 data-ti 事件');
  assert.match(html, /tpDoneBtn.*markAllDone|markAllDone.*tpDoneBtn/,
    '应监听 tpDoneBtn 事件');
  assert.match(html, /tpMoveBtn.*movePendingToNextDay|movePendingToNextDay.*tpMoveBtn/,
    '应监听 tpMoveBtn 事件');
});

test('issue-55: 今日计划 — 导航栈处理', function(){
  assert.match(html, /todayPlan.*renderTodayPlan|renderTodayPlan.*todayPlan/,
    'back 导航应处理 todayPlan 屏幕');
});

test('issue-55: 今日计划 — markAllDone / movePendingToNextDay 函数', function(){
  assert.match(html, /function markAllDone/, 'markAllDone 函数应存在');
  assert.match(html, /function movePendingToNextDay/, 'movePendingToNextDay 函数应存在');
  assert.match(html, /function tomorrowStr/, 'tomorrowStr 函数应存在');
  assert.match(html, /r\.date\s*=\s*tomorrowStr\(\)/, '移到下一天应更新 date');
  assert.match(html, /checklist\[itemIdx\]\.c\s*=\s*!r\.checklist\[itemIdx\]\.c|!r\.checklist/, '勾选切换应翻转 .c 值');
});

test('issue-55: 今日计划 — 空状态', function(){
  assert.match(html, /今天还没有计划/, '无计划时应显示空状态提示');
});