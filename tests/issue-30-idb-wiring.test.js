// Issue-30: 把读写真正切换到 IndexedDB（业务数据不再落 localStorage）
// 规格要点：
//   1) 严禁用 localStorage 存业务数据（5MB 上限 + 只能存字符串）
//   2) 图片以 Blob 存 IndexedDB，渲染时转 objectURL，绝不把 Base64 混进业务数据
//   3) 删除的记录要从库里真正移除（内存删了库里还在 = 幽灵数据）
// 浏览器 API 无法在 Node 下运行，故走源码接线断言 + 纯函数断言。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { LEGACY_LS_KEY } from '../src/app-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../work-memo-app.html'), 'utf8');
const dbSrc = readFileSync(resolve(here, '../src/note-db.js'), 'utf8');

/* ---------------- 存储模式与初始化 ---------------- */

test('源码：引入 NoteDB 并具备 idb / ls 双模式', () => {
  assert.match(html, /import \{ NoteDB, compressImage, sha256Hex \} from '\.\/src\/note-db\.js'/,
    '必须引入数据层');
  assert.match(html, /var STORAGE_MODE = 'idb';/, '默认走 IndexedDB');
  assert.match(html, /var noteDB = new NoteDB\(\);/, '需实例化数据层');
  assert.match(html, /function idbSupported\(\)/, '需探测环境是否支持 IndexedDB');
});

test('源码：启动时先等 IndexedDB 载入再渲染，且失败不白屏', () => {
  // Issue-39 起：启动引导额外包了超时兜底，挂起时也能打开 App
  assert.match(html, /raceTimeout\(bootstrapStore\(\),[\s\S]{0,90}?\.then\(/, '启动改为异步引导');
  const init = html.slice(html.indexOf('/* ============ INIT ============ */'));
  // 渲染必须发生在 bootstrapStore 之后，否则会先闪一帧内置示例数据
  assert.ok(init.indexOf('bootstrapStore()') < init.indexOf('renderHome()'),
    '渲染前必须先完成数据载入');
  assert.match(init, /\.catch\(/, '存储层异常要有兜底，不能白屏');
});

test('源码：saveDB 排队写盘，分流到 IndexedDB；localStorage 仅作降级路径', () => {
  // Issue-31 起 saveDB 只负责排队（防抖 3s），真正的模式分流在 flushPersist
  assert.match(html, /function saveDB\(\)\{[\s\S]{0,200}?setTimeout\(/, 'saveDB 改为防抖排队');
  assert.match(html, /if\(STORAGE_MODE === 'idb'\) persistToIdb\(\);\s*\n?\s*else saveDBLegacy\(\);/,
    'flushPersist 按模式分流');
  // 业务数据写 localStorage 只允许出现一次（降级函数），且必须受 STORAGE_MODE 保护
  const lsWrites = html.match(/localStorage\.setItem\(LS_KEY/g) || [];
  assert.equal(lsWrites.length, 1, '业务数据写 localStorage 只允许降级路径一处');
  const legacy = html.slice(html.indexOf('function saveDBLegacy'));
  assert.ok(legacy.indexOf('localStorage.setItem(LS_KEY') < legacy.indexOf('\n}'),
    '该次写入必须位于 saveDBLegacy 内');
  // 每日一句的标记位属于 UI 状态，不是业务数据，允许保留
  assert.match(html, /localStorage\.setItem\('work-memo-quote-last'/, '每日一句标记位不受影响');
});

test('源码：LS_KEY 复用旧键名，保证旧数据可迁移', () => {
  assert.match(html, /var LS_KEY = LEGACY_LS_KEY;/);
  assert.equal(LEGACY_LS_KEY, 'work-memo-db-v1');
});

/* ---------------- 写路径：新增 / 变更 / 删除 ---------------- */

test('源码：写盘覆盖笔记、meta 三键，并按差集删除已移除的记录', () => {
  const p = html.slice(html.indexOf('async function persistToIdb'), html.indexOf('function saveDB()'));
  assert.match(p, /noteDB\.putManyNotes\(list, Date\.now\(\)\)/, '批量写笔记');
  assert.match(p, /noteDB\.setMeta\('folders', DB\.folders\)/);
  assert.match(p, /noteDB\.setMeta\('events', DB\.events\)/);
  assert.match(p, /noteDB\.setMeta\('settings', DB\.settings\)/);
  // 删除操作分散在多处（单删/批量删/清空文件夹），统一按差集清理最可靠
  assert.match(p, /if\(!alive\[rows\[i\]\.id\]\) await noteDB\.deleteNote\(rows\[i\]\.id\)/,
    '内存里已删的记录必须从库里移除');
  assert.match(p, /noteDB\.relinkImages\(\)/, '新笔记先选图后保存，需回填图片归属');
});

test('源码：删除走 NoteDB.deleteNote（先删图再删记录）', () => {
  assert.match(dbSrc, /async deleteNote\(id\)\s*\{[\s\S]{0,200}?deleteImagesOf\(id\)/,
    '删笔记必须先删关联图片，否则留下无法定位的孤儿 Blob');
});

/* ---------------- 图片渲染路径 ---------------- */

test('源码：图片渲染走 Blob → objectURL，不把 Base64 塞回业务数据', () => {
  assert.match(html, /async function hydrateRecordImages\(rec\)/, '需把 Blob 转成可渲染 URL');
  assert.match(html, /imageUrlCache\[imageId\] = url;/, '同一张图复用 URL，避免重复创建');
  assert.match(html, /URL\.revokeObjectURL\(/, '换图/删图后必须释放，防止内存泄漏');
  assert.match(html, /function releaseUnusedImageUrls\(\)/, '需清理无引用的 objectURL');
});

test('源码：选图入库走 saveImage，并按去重结果给出反馈', () => {
  assert.match(html, /async function handleImagePick\(files\)/);
  assert.match(html, /var res = await noteDB\.saveImage\(noteId, picked\[i\]\);/, '走压缩+去重管线');
  assert.match(html, /editing\.data\.image_ids = normalizeImageIds\(ids\)/, '只把 id 数组外键挂在记录上');
  // 边界收紧到下一个函数定义：compressImageFile 紧跟其后，
  // 且它仍被「自定义背景」合法使用，不能算作记录图片的旧路径
  const pick = html.slice(
    html.indexOf('async function handleImagePick'),
    html.indexOf('function compressImageFile')
  );
  assert.doesNotMatch(pick, /compressImageFile\(/, '记录图片不再走旧的 dataURL 压缩路径');
  assert.match(pick, /res\.deduped/, '命中去重要提示用户未额外占用空间');
});

test('源码：删除单张图片时清掉对应 id，且无人引用时真删存储', () => {
  const delStart = html.indexOf('function deleteImageAt(index)');
  const delEnd = html.indexOf('function paintEditor()', delStart);
  assert.ok(delStart >= 0 && delEnd > delStart, '未定位到 deleteImageAt，边界锚点可能已失效');
  const del = html.slice(delStart, delEnd);
  assert.match(del, /ids\.splice\(index, 1\)/, '从 image_ids 中移除对应项');
  assert.match(del, /isImageIdUsed\(DB\.records, removedId\)/, '删前确认没有别的记录在用它');
  assert.match(del, /noteDB\.deleteImage\(removedId\)/, '无人引用时删掉 Blob，否则空间一直占着');
  assert.match(del, /saveDB\(\)/, '删除后要落盘');
});

/* ---------------- 记录 id 与列表查询 ---------------- */

test('源码：记录补齐 id 字段（IndexedDB keyPath 需要）', () => {
  assert.match(html, /r\.id = k;/, '旧数据只有键、没有 id 字段，需补齐');
  assert.match(html, /d\.id=nid;/, '新建记录落库前必须带上 id');
});

test('源码：「我的」存储用量读 IndexedDB 统计，而非过时的 dataURL 估算', () => {
  assert.match(html, /imageStatsCache\.count/, '展示图片张数');
  assert.match(html, /imageStatsCache\.bytes/, '展示图片占用');
  assert.match(html, /async function refreshImageStats\(\)/);
  // 图片已不是 dataURL，sumImageBytes 的结果恒为 0，不能再用它展示
  assert.doesNotMatch(
    html.slice(html.indexOf("'<div class=\"me-row\" data-optimize")),
    /sumImageBytes\(DB\.records\)/,
    '不得再用 dataURL 估算展示图片占用'
  );
});

test('源码：优化存储改为清理孤儿图片（图片入库即压缩，无需二次压缩）', () => {
  const opt = html.slice(html.indexOf('async function optimizeStorage'), html.indexOf('async function optimizeStorage') + 900);
  assert.match(opt, /cleanupOrphanImages\(\)/, '清理不再被引用的图片');
  assert.doesNotMatch(opt, /toDataURL\('image\/jpeg'/, '不再做二次 dataURL 压缩');
});

/* ---------------- 导出 ---------------- */

test('源码：导出剔除运行时 blob URL，并把图片一并带走', () => {
  assert.match(html, /async function buildExportRecords\(\)/);
  assert.match(html, /delete rec\.images;/, 'blob URL 换设备即失效，不能写进导出文件');
  assert.match(html, /rec\.images_base64\.push\(blob \? await blobToDataUrl\(blob\) : null\)/, '备份需能还原全部照片');
  assert.match(html, /records:await buildExportRecords\(\)/, '导出走新的记录副本');
});

/* ---------------- 纯函数：导出键名一致性 ---------------- */

test('LEGACY_LS_KEY 与 HTML 中 localStorage 读取键一致', () => {
  assert.match(html, /localStorage\.getItem\(LS_KEY\)/);
  assert.equal(LEGACY_LS_KEY, 'work-memo-db-v1');
});
