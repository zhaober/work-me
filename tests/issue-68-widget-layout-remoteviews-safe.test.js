// issue-68: 桌面报「载入窗口小部件时出现问题」—— 小组件布局里用了 RemoteViews 不允许的类
//
// 现场：一键添加后小组件确实放到了桌面，但 MIUI 显示"载入窗口小部件时出现问题"。
//
// 根因：RemoteViews 在宿主端 inflate 时会按 @RemoteView 注解过滤元素类：
//   RemoteViews.onLoadClass(clazz) → clazz.isAnnotationPresent(RemoteView.class)
//   inflater.setFilter(shouldUseStaticFilter() ? INFLATER_FILTER : this)   // 两者同一规则
// LinearLayout / TextView / ImageView / FrameLayout / RelativeLayout / GridLayout
// 都带这个注解（已核对 AOSP android13-release 源码），
// 但 **android.view.View 没有**（View.java 全文不含 RemoteView）——
// 所以拿 <View> 当纯色块会让整个布局 inflate 抛 InflateException，
// 桌面就显示"载入窗口小部件时出现问题"。问题B 给三款小组件加的黄色强调条正是 <View>。
//
// 这个测试把"布局里只准出现 RemoteViews 放行的类"变成硬约束，
// 并顺带卡住 android:angle 必须是 45 的倍数（另一个 inflate 期才炸的坑）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RES = new URL('../WorkMemoApp/android/app/src/main/res/', import.meta.url);
const LAYOUT_DIR = fileURLToPath(new URL('layout/', RES));
const DRAWABLE_DIR = fileURLToPath(new URL('drawable/', RES));

/** 带 @RemoteView 注解、可在 RemoteViews 布局里使用的类 */
const ALLOWED = new Set([
  'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout',
  'AnalogClock', 'Button', 'Chronometer', 'ImageButton', 'ImageView',
  'ProgressBar', 'TextView', 'ViewFlipper', 'ListView', 'GridView',
  'StackView', 'AdapterViewFlipper', 'ViewStub',
]);

const widgetLayouts = readdirSync(LAYOUT_DIR).filter((f) => f.startsWith('widget_') && f.endsWith('.xml'));

/** 去掉注释后再取标签名——注释里会写 "<View>" 举例，不能当成真元素 */
function elementTags(xml) {
  const noComment = xml.replace(/<!--[\s\S]*?-->/g, '');
  const tags = [];
  const re = /<([A-Za-z][\w.]*)/g;
  let m;
  while ((m = re.exec(noComment)) !== null) tags.push(m[1]);
  return tags;
}

test('小组件布局都用到了（否则下面的断言是空转）', () => {
  assert.ok(widgetLayouts.length >= 3, '至少应有 3 款小组件布局，实际 ' + widgetLayouts.length);
  for (const f of ['widget_today.xml', 'widget_recent.xml', 'widget_schedule.xml']) {
    assert.ok(widgetLayouts.includes(f), '缺少 ' + f);
  }
});

test('布局里只出现 RemoteViews 放行的类（<View> 会让整块小组件 inflate 失败）', () => {
  for (const f of widgetLayouts) {
    const xml = readFileSync(LAYOUT_DIR + f, 'utf8');
    const tags = elementTags(xml);
    assert.ok(tags.length > 0, f + ' 没解析出元素');
    const bad = tags.filter((t) => !ALLOWED.has(t));
    assert.deepEqual(bad, [], f + ' 里出现了 RemoteViews 不允许的类：' + bad.join(', '));
  }
});

test('明确禁止 <View>（android.view.View 无 @RemoteView 注解）', () => {
  for (const f of widgetLayouts) {
    const xml = readFileSync(LAYOUT_DIR + f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.equal(/<\s*View[\s/>]/.test(xml), false, f + ' 用了 <View>，请改用 TextView/ImageView 当纯色块');
  }
});

test('纯色强调条用 TextView 实现（有背景色、无文本）', () => {
  const today = readFileSync(LAYOUT_DIR + 'widget_today.xml', 'utf8');
  assert.match(today, /<TextView[\s\S]*?android:layout_width="3dp"[\s\S]*?android:background="#F5C518"\s*\/>/);
  const sched = readFileSync(LAYOUT_DIR + 'widget_schedule.xml', 'utf8');
  assert.match(sched, /android:background="#F5C518"\s*\/>/);
});

test('组件引用的 drawable 都存在', () => {
  const referenced = new Set();
  for (const f of widgetLayouts) {
    const xml = readFileSync(LAYOUT_DIR + f, 'utf8');
    const re = /@drawable\/([\w.]+)/g;
    let m;
    while ((m = re.exec(xml)) !== null) referenced.add(m[1]);
  }
  assert.ok(referenced.size > 0);
  const available = new Set(readdirSync(DRAWABLE_DIR).map((f) => f.replace(/\.xml$/, '')));
  for (const d of referenced) assert.ok(available.has(d), '布局引用了不存在的 drawable: ' + d);
});

test('小组件布局里没有重复 id（生成脚本的常见错，排查起来很费劲）', () => {
  for (const f of widgetLayouts) {
    const xml = readFileSync(LAYOUT_DIR + f, 'utf8');
    const ids = [];
    const re = /android:id="@\+id\/([\w]+)"/g;
    let m;
    while ((m = re.exec(xml)) !== null) ids.push(m[1]);
    const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    assert.deepEqual([...new Set(dup)], [], f + ' 里有重复 id');
  }
});

test('布局里没有 RemoteViews 不支持的 <include> / <merge>', () => {
  for (const f of widgetLayouts) {
    const xml = readFileSync(LAYOUT_DIR + f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.equal(/<\s*(include|merge)[\s/>]/.test(xml), false, f + ' 用了 include/merge');
  }
});

test('drawable 里 <gradient> 的 angle 是 45 的倍数（否则也在 inflate 期才炸）', () => {
  const files = readdirSync(DRAWABLE_DIR).filter((f) => /^(widget_|wc_)/.test(f) && f.endsWith('.xml'));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const xml = readFileSync(DRAWABLE_DIR + f, 'utf8');
    const re = /android:angle="(-?\d+)"/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const deg = Number(m[1]);
      assert.equal(deg % 45, 0, f + ' 的 android:angle=' + deg + ' 不是 45 的倍数');
    }
  }
});
