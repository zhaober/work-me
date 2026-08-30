// Issue-31: 写入策略与旧数据迁移
// 规格要点：
//   5) 防抖保存：输入后延迟 3000ms 写盘，每次新输入重置定时器
//      页面切后台（visibilitychange / pagehide）立即强制保存，防直接关标签页丢数据
//   7) 删除笔记先删关联图片再删笔记；IndexedDB 不会自动归还磁盘空间，需提示
//   迁移：localStorage 旧数据一次性搬进 IndexedDB，旧 dataURL 图片转成 Blob，不能丢照片
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../work-memo-app.html'), 'utf8');

/* ---------------- 防抖保存 ---------------- */

test('源码：防抖时长为规格要求的 3000ms', () => {
  assert.match(html, /var PERSIST_DELAY = 3000;/, '输入停止 3 秒后写盘');
});

test('源码：saveDB 每次调用都重置定时器（连续输入只写一次）', () => {
  const save = html.slice(html.indexOf('function saveDB()'), html.indexOf('function saveDB()') + 300);
  assert.match(save, /if\(persistTimer\) clearTimeout\(persistTimer\);/, '新输入必须清掉旧定时器');
  assert.match(save, /setTimeout\([\s\S]*?PERSIST_DELAY\)/, '按 PERSIST_DELAY 重新计时');
  assert.doesNotMatch(save, /persistToIdb\(\)/, 'saveDB 不得直接写盘，必须走定时器');
});

test('源码：flushPersist 取消待执行定时器并立即落盘', () => {
  const flush = html.slice(html.indexOf('function flushPersist()'), html.indexOf('function saveDB()'));
  assert.match(flush, /clearTimeout\(persistTimer\); persistTimer = null;/, '取消待执行的防抖');
  assert.match(flush, /if\(STORAGE_MODE === 'idb'\) persistToIdb\(\);/, '按模式立即写盘');
  assert.match(flush, /else saveDBLegacy\(\);/, '降级路径同样要能立即写盘');
});

/* ---------------- 切后台 / 关闭强制落盘 ---------------- */

test('源码：切后台与关页面都强制落盘', () => {
  assert.match(html, /function armFlushHooks\(\)/);
  const hooks = html.slice(html.indexOf('function armFlushHooks()'), html.indexOf('function armFlushHooks()') + 400);
  assert.match(hooks, /addEventListener\('visibilitychange'/, '监听切后台');
  assert.match(hooks, /if\(document\.hidden\) flushPersist\(\);/, '仅在真正隐藏时落盘，避免切回来也写一次');
  assert.match(hooks, /addEventListener\('pagehide', flushPersist\)/, '移动端常用路径（iOS 不触发 beforeunload）');
  assert.match(hooks, /addEventListener\('beforeunload', flushPersist\)/, '桌面端关闭标签页');
});

test('源码：启动引导时挂载强制落盘钩子', () => {
  const boot = html.slice(html.indexOf('async function bootstrapStore()'), html.indexOf('async function bootstrapStore()') + 300);
  assert.match(boot, /armFlushHooks\(\);/, '钩子必须在引导最开始挂上');
});

/* ---------------- 编辑输入自动存草稿 ---------------- */

test('源码：编辑已有记录时输入即存草稿（防抖落盘）', () => {
  assert.match(html, /function autoSaveDraft\(\)/);
  const auto = html.slice(html.indexOf('function autoSaveDraft()'), html.indexOf('function bindEditor'));
  assert.match(auto, /if\(!editing \|\| editing\.isNew\) return;/,
    '新建记录不自动入库，保留「返回键 = 放弃未保存改动」语义');
  assert.match(auto, /DB\.records\[editing\.id\] = clone\(editing\.data\);/, '写回内存记录');
  assert.match(auto, /saveDB\(\);/, '触发防抖落盘');
});

test('源码：标题 / 正文 / 清单文本输入都接了自动存草稿', () => {
  assert.match(html, /editing\.data\.title=this\.textContent; autoSaveDraft\(\);/);
  assert.match(html, /editing\.data\.body=this\.textContent; autoSaveDraft\(\);/);
  assert.match(html, /editing\.data\.checklist\[ci\]\.t=this\.textContent; autoSaveDraft\(\);/);
});

test('源码：勾选清单项与切换优先级也自动存草稿（非文本改动同样会丢）', () => {
  assert.match(html, /editing\.data\.checklist\[ci\]\.c=!on; autoSaveDraft\(\);/);
  assert.match(html, /playSound\('toggle'\); autoSaveDraft\(\); \}\); \}\);/);
});

/* ---------------- 旧数据迁移 ---------------- */

test('源码：迁移函数在引导阶段被调用，且先于载入执行', () => {
  const boot = html.slice(html.indexOf('async function bootstrapStore()'), html.indexOf('async function bootstrapStore()') + 900);
  assert.match(boot, /await migrateLegacyData\(\);/);
  assert.ok(boot.indexOf('migrateLegacyData()') < boot.indexOf('loadFromIdb()'),
    '必须先迁移再载入，否则读到的还是空库');
  assert.match(boot, /if\(migrated\) toast\(/, '迁移完成要给用户明确反馈');
});

test('源码：旧 dataURL 图片转成 Blob 存入图片仓库，不把 Base64 带进新库', () => {
  const mig = html.slice(html.indexOf('async function migrateLegacyData()'), html.indexOf('/* ============ NAVIGATION'));
  assert.match(mig, /r\.image\.indexOf\('data:image\/'\) === 0/, '识别 Base64 图片');
  assert.match(mig, /var blob = await dataUrlToBlob\(r\.image\)/, '先转成 Blob');
  assert.match(mig, /await noteDB\.saveImage\(k, blob\)/, '走新管线（压缩 + 去重）入库');
  assert.match(mig, /r\.image_ids = normalizeImageIds\(ids\)/, '回填外键数组（多图结构）');
  assert.match(mig, /delete r\.image;/, 'Base64 不进新库');
});

test('源码：迁移是幂等的（靠 meta 标记，不会每次启动重复搬）', () => {
  const mig = html.slice(html.indexOf('async function migrateLegacyData()'), html.indexOf('/* ============ NAVIGATION'));
  assert.match(mig, /var flag = await noteDB\.getMeta\('migratedFrom'\);/);
  assert.match(mig, /if\(flag\) return 0;/, '已迁移过直接跳过');
  assert.match(mig, /setMeta\('migratedFrom', 'localStorage@v1'\)/, '成功后打标记');
  assert.match(mig, /setMeta\('migratedFrom', 'fresh'\)/, '无旧数据也要打标记，避免每次启动都读一遍 localStorage');
});

test('源码：迁移覆盖 folders / events / settings，并保留 localStorage 副本作回滚保险', () => {
  const mig = html.slice(html.indexOf('async function migrateLegacyData()'), html.indexOf('/* ============ NAVIGATION'));
  assert.match(mig, /setMeta\('folders', parsed\.folders\)/);
  assert.match(mig, /setMeta\('events', parsed\.events\)/);
  assert.match(mig, /setMeta\('settings', parsed\.settings\)/);
  // 不主动删除旧数据：迁移万一中断，用户还能退回旧版本读回数据
  assert.doesNotMatch(mig, /removeItem\(LS_KEY\)/, '迁移后不删旧数据，保留回滚保险');
});

test('源码：迁移失败不影响启动（整体包在 try/catch 里返回 0）', () => {
  const mig = html.slice(html.indexOf('async function migrateLegacyData()'), html.indexOf('/* ============ NAVIGATION'));
  assert.match(mig, /catch\(e\)\{\s*\n?\s*return 0;/);
  assert.match(mig, /单张图迁移失败不阻断整体/, '单张图失败要容错');
});

/* ---------------- 删除与空间释放 ---------------- */

test('源码：删笔记走 NoteDB.deleteNote（内部先删图再删记录）', () => {
  assert.match(html, /noteDB\.deleteNote\(rows\[i\]\.id\)/, '写盘差集清理走同一个删除入口');
});

test('源码：提供孤儿图片清理入口（IndexedDB 删除后不自动归还磁盘空间）', () => {
  assert.match(html, /cleanupOrphanImages\(\)/, '清理不再被引用的图片 Blob');
  assert.match(html, /relinkImages\(\)/, '回填新建笔记的图片归属，避免误判为孤儿');
});
