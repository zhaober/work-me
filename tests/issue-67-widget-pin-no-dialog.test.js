// issue-67: 点「添加到桌面」没弹窗、也没任何反应
//
// 现场：小米/红米调用 requestPinAppWidget() **不弹确认框**（设计如此，直接添加，
// 桌面放不下还会自动新建一页），而且若未授予「桌面快捷方式」权限会**静默失败**。
// 原来的实现有两处错：
//   1) 调用前先拿 isRequestPinAppWidgetSupported() 拦一刀，部分国产 ROM 误报 false
//   2) 只要没返回 false 就提示"请在系统弹窗中确认放置" —— 小米上根本不会弹窗，
//      用户以为失败了，其实小组件已经在新增的那一页里
// 修法：直接尝试调用、把原因分类回传、并记录"发起前实例数"，
//      回到 App 时比一次数量，给出"到底成没成"的确定结论。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');
const PLUGIN = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/WidgetBridgePlugin.java', import.meta.url), 'utf8');
const MANIFEST = readFileSync(new URL('../WorkMemoApp/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const MAIN = readFileSync(new URL('../WorkMemoApp/android/app/src/main/java/com/workmemo/app/MainActivity.java', import.meta.url), 'utf8');

/* ---------------- 清单 / 权限 ---------------- */

test('清单：声明桌面快捷方式权限（小米未授予时会静默失败）', () => {
  assert.match(MANIFEST, /com\.android\.launcher\.permission\.INSTALL_SHORTCUT/);
  assert.match(MANIFEST, /com\.android\.launcher\.permission\.UNINSTALL_SHORTCUT/);
  assert.match(MANIFEST, /<uses-permission android:name="com\.android\.launcher\.permission\.INSTALL_SHORTCUT" \/>/);
});

/* ---------------- 原生：不再提前拦截 ---------------- */

test('原生：先直接尝试 requestPinAppWidget，不拿 isRequestPinAppWidgetSupported 提前拦截', () => {
  // 该 API 只能当诊断信息出现，不能出现在 if 条件里直接 return
  assert.match(PLUGIN, /boolean apiSupported = false;[\s\S]*?apiSupported = mgr\.isRequestPinAppWidgetSupported\(\)/);
  assert.match(PLUGIN, /ret\.put\("apiSupported", apiSupported\)/);
  const guard = PLUGIN.match(/if \(!mgr\.isRequestPinAppWidgetSupported\(\)\)/);
  assert.equal(guard, null, '不应再用 isRequestPinAppWidgetSupported() 提前 return');
});

test('原生：尝试调用包在 try/catch 里，异常也回传原因', () => {
  assert.match(PLUGIN, /try \{\s*launched = mgr\.requestPinAppWidget\(cn, null, null\);\s*\} catch \(Exception e\) \{\s*reason = "exception";\s*ret\.put\("message", String\.valueOf\(e\.getMessage\(\)\)\);\s*\}/);
});

test('原生：原因分类覆盖全部路径', () => {
  for (const r of ['android-too-old', 'launcher-unsupported', 'request-returned-false', 'exception', 'ok']) {
    assert.match(PLUGIN, new RegExp('"' + r + '"'), '缺少 reason: ' + r);
  }
  assert.match(PLUGIN, /reason = apiSupported \? "request-returned-false" : "launcher-unsupported"/);
  assert.match(PLUGIN, /ret\.put\("supported", launched \|\| apiSupported\)/);
  assert.match(PLUGIN, /ret\.put\("launched", launched\)/);
});

test('原生：组件映射抽成 componentOf，requestPin 与实例计数共用', () => {
  assert.match(PLUGIN, /static ComponentName componentOf\(Context ctx, String which\)/);
  assert.match(PLUGIN, /if \("recent"\.equals\(which\)\) return new ComponentName\(ctx, RecentWidgetProvider\.class\)/);
  assert.match(PLUGIN, /if \("grid"\.equals\(which\)\) return new ComponentName\(ctx, ScheduleWidgetProvider\.class\)/);
  assert.match(PLUGIN, /return new ComponentName\(ctx, TodayWidgetProvider\.class\)/);
  assert.match(PLUGIN, /ComponentName cn = componentOf\(ctx, which\);[\s\S]*?int before = countWidgets\(ctx, which\);/);
});

/* ---------------- 原生：结果确认 ---------------- */

test('原生：requestPin 记录待确认请求（widget/before/at）', () => {
  assert.match(PLUGIN, /static final String PREFS_KEY_PIN_PENDING = "pin_pending"/);
  assert.match(PLUGIN, /new JSONObject\(\)[\s\S]*?\.put\("widget", which\)[\s\S]*?\.put\("before", before\)[\s\S]*?\.put\("at", System\.currentTimeMillis\(\)\)/);
  assert.match(PLUGIN, /putString\(PREFS_KEY_PIN_PENDING, pending\.toString\(\)\)/);
});

test('原生：consumePinResult 用实例数前后对比判定是否真的加上了', () => {
  assert.match(PLUGIN, /@PluginMethod\s*\n\s*public void consumePinResult\(PluginCall call\)/);
  assert.match(PLUGIN, /int after = countWidgets\(ctx, which\);/);
  assert.match(PLUGIN, /ret\.put\("added", after > 0 && before >= 0 && after > before\)/);
  // 查询异常不能当成"添加成功"
  assert.match(PLUGIN, /ret\.put\("unknown", after < 0\)/);
  assert.match(PLUGIN, /int countWidgets\(Context ctx, String which\)[\s\S]*?catch \(Exception e\) \{\s*return -1;\s*\}/);
  // 取后即清，避免每次开面板都重复报结论
  assert.match(PLUGIN, /\.edit\(\)\.remove\(PREFS_KEY_PIN_PENDING\)\.apply\(\)/);
  // 没发起过请求时不误报
  assert.match(PLUGIN, /if \(raw == null \|\| raw\.isEmpty\(\)\) \{\s*ret\.put\("pending", false\);/);
});

/* ---------------- 原生：自愈漏项 ---------------- */

test('原生：onResume 自愈刷新包含课表网格（原来漏了）', () => {
  assert.match(MAIN, /TodayWidgetProvider\.pushUpdate\(this\);[\s\S]*?RecentWidgetProvider\.pushUpdate\(this\);[\s\S]*?ScheduleWidgetProvider\.pushUpdate\(this\);/);
});

/* ---------------- JS：文案与确认 ---------------- */

test('JS：不再提示"请在系统弹窗中确认放置"（小米不弹框，会误导）', () => {
  assert.equal(/请在系统弹窗中确认放置/.test(HTML), false);
  assert.match(HTML, /已请求添加：部分手机会直接放到桌面（可能新增一页），请左右滑动查看/);
});

test('JS：明确告知小米/红米不弹确认框且会新增一页', () => {
  assert.match(HTML, /小米\/红米等手机<b>不会弹确认框<\/b>/);
  assert.match(HTML, /自动新增一页<\/b>，请左右滑动找一找/);
  // 手动兜底步骤要点到「桌面快捷方式」这个小米特有的权限开关
  assert.match(HTML, /打开<b>「桌面快捷方式」<\/b>/);
  assert.match(HTML, /长按桌面空白处 → 添加小部件 → 搜索"课表网格"/);
});

test('JS：桌面未受理时区分"不支持"与"支持但没落地"', () => {
  assert.match(HTML, /if\(res && res\.launched === false\)\{/);
  assert.match(HTML, /res\.apiSupported === false[\s\S]*?'当前桌面不支持一键添加，请长按桌面手动添加'[\s\S]*?: '桌面未响应该请求，请按提示手动添加'/);
});

test('JS：向原生取回确定结论并如实反馈', () => {
  assert.match(HTML, /function refreshWidgetPinStatus\(\)/);
  assert.match(HTML, /typeof bridge\.consumePinResult !== 'function'/);
  assert.match(HTML, /if\(res\.added\)/);
  assert.match(HTML, /已检测到桌面新增了「/);
  assert.match(HTML, /未检测到桌面新增小组件，请按提示手动添加/);
  assert.match(HTML, /else if\(res\.unknown\)/);
  assert.match(HTML, /function widgetLabel\(which\)/);
  assert.match(HTML, /which === 'grid' \? '课表网格' : \(which === 'recent' \? '近日课程' : '今日课程'\)/);
});

test('JS：开面板与回到前台都会确认一次', () => {
  assert.match(HTML, /openCustomModal\('课表小组件', html\);\s*\n\s*refreshWidgetPinStatus\(\);/);
  assert.match(HTML, /if\(state && state\.isActive\)\{ syncScheduleWidget\(\);\s*\n\s*try \{ refreshWidgetPinStatus\(\); \}/);
});

test('JS：面板带低干扰诊断行，便于用户反馈时截图', () => {
  assert.match(HTML, /function widgetPinStatusHtml\(\)/);
  assert.match(HTML, /id="widgetPinStatus"/);
  assert.match(HTML, /'最近一次请求（' \+ escapeHtml\(last\.which\) \+ '）：' \+ escapeHtml\(bits\.join\(' · '\)\)/);
  assert.match(HTML, /\.widget-status\{font-size:10px/);
  assert.match(HTML, /\.widget-status:empty\{display:none;\}/);
});

test('回归：原有降级路径仍然保留', () => {
  assert.match(HTML, /'请在手机上使用该功能'/);
  assert.match(HTML, /console\.warn\('\[widget\] requestPin 失败:'/);
  assert.match(HTML, /bridge\.requestPin\(\{ widget: which \}\)/);
});

test('镜像：HTML 与 www 一致', () => {
  const www = readFileSync(new URL('../WorkMemoApp/www/index.html', import.meta.url), 'utf8');
  assert.equal(HTML, www);
});
