import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

var html = readFileSync('work-memo-app.html', 'utf8');

test('issue-56: 今日复盘 — HTML 结构存在', function(){
  assert.match(html, /id="todayReview"/, '今日复盘屏幕节点应存在');
  assert.match(html, /id="todayReviewToday"/, '今日复盘区应存在');
  assert.match(html, /id="todayReviewHistory"/, '过往复盘区应存在');
});

test('issue-56: 今日复盘 — 今日复盘卡片可点击', function(){
  assert.match(html, /data-go-today-review/, '今日复盘卡片应带 data-go-today-review 属性');
});

test('issue-56: 今日复盘 — CSS 样式存在', function(){
  assert.match(html, /\.today-review-today/, '应有 .today-review-today 样式');
  assert.match(html, /\.today-review-section-title/, '应有 .today-review-section-title 样式');
  assert.match(html, /\.today-review-list/, '应有 .today-review-list 样式');
  assert.match(html, /\.today-review-item/, '应有 .today-review-item 样式');
  assert.match(html, /\.today-review-empty/, '应有 .today-review-empty 样式');
  assert.match(html, /\.tr-link/, '应有 .tr-link 样式');
});

test('issue-56: 今日复盘 — renderTodayReview 函数存在且逻辑正确', function(){
  assert.match(html, /function renderTodayReview/, 'renderTodayReview 函数应存在');
  assert.match(html, /r\.type !== 'review'/, '应过滤仅 review 类型');
  assert.match(html, /r\.date === TODAY/, '今日项判断');
  assert.match(html, /function reviewItemHtml/, 'reviewItemHtml 函数应存在');
  assert.match(html, /b\.r\.date\.localeCompare\(a\.r\.date\)/, '过往复盘应按日期倒序');
});

test('issue-56: 今日复盘 — 按年月分组', function(){
  assert.match(html, /pp\[0\] \+ '年' \+ parseInt\(pp\[1\], 10\) \+ '月'/, '应按 YYYY年M月 分组');
  assert.match(html, /var groups = \{\}/, '应构建分组对象');
  assert.match(html, /groupKeys\.map/, '应渲染每个分组');
});

test('issue-56: 今日复盘 — 关联计划展示', function(){
  assert.match(html, /r\.linkPlanId && DB\.records\[r\.linkPlanId\]/, '应展示关联计划');
  assert.match(html, /未关联/, '无关联计划时应显示「未关联」');
  assert.match(html, /data-open-review=.*recId/, '每条复盘应可点击进入编辑器');
});

test('issue-56: 今日复盘 — 事件委托存在', function(){
  assert.match(html, /data-go-today-review.*renderTodayReview|renderTodayReview.*data-go-today-review/, '应监听 data-go-today-review 事件');
  assert.match(html, /data-open-review.*openRecord|openRecord.*data-open-review/, '应监听 data-open-review 事件');
});

test('issue-56: 今日复盘 — 导航栈处理', function(){
  assert.match(html, /todayReview.*renderTodayReview|renderTodayReview.*todayReview/, 'back 导航应处理 todayReview 屏幕');
});

test('issue-56: 今日复盘 — 空状态', function(){
  assert.match(html, /今天还没写复盘/, '无今日复盘时应显示引导文案');
  assert.match(html, /还没有过往复盘|过往复盘/, '过往复盘区应存在或显示空状态');
});