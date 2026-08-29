// Issue-32: 存储层集成验证（真实跑一遍 IndexedDB）
// Issue-28~31 全靠源码断言，只能证明「接线对了」，不能证明「跑得通」。
// 本文件用 fake-indexeddb 提供内存版 IndexedDB，真实执行 NoteDB 的增删查改、
// 分表读写、去重查询与孤儿清理，验证存储重写确实可用。
//
// 运行前提：需先 npm install（devDependency: fake-indexeddb）。
// 未安装时全部用例自动跳过，不影响 node --test tests/*.test.js 的正常执行。
import { test } from 'node:test';
import assert from 'node:assert/strict';

let NoteDB, sha256Hex, recordToRow, buildImageRow, makeImageId, STORES, IDB_NAME;
let available = false;

try {
  await import('fake-indexeddb/auto');
  ({ NoteDB, sha256Hex } = await import('../src/note-db.js'));
  ({ recordToRow, buildImageRow, makeImageId, STORES, IDB_NAME } = await import('../src/app-core.js'));
  available = typeof indexedDB !== 'undefined';
} catch (e) {
  available = false;
}

/** 每个用例用独立库名，避免 fake-indexeddb 在用例间串数据 */
let seq = 0;
const freshDB = () => new NoteDB({ name: `${IDB_NAME}-test-${Date.now()}-${seq++}` });

/**
 * 测试侧的裸表读写助手。
 * IndexedDB 的原生 API 返回 IDBRequest 而非 Promise，直接用它做断言会让
 * assert 去深比较一个带循环引用的请求对象 —— 所以必须自己包一层。
 */
function putRow(db, store, row) {
  return new Promise((resolve, reject) => {
    const tx = db.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(row);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function getRow(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const sampleRecord = (id, title, body) => ({
  id,
  type: 'plan',
  folderId: 'work',
  title,
  date: '2026-08-29',
  time: '09:20',
  reminder: '18:00',
  tags: ['重要', '跟进'],
  priority: 1,
  image_id: null,
  checklist: [{ t: '拉齐研发排期', c: true }, { t: '确认灰度方案', c: false }],
  body,
});

const LONG_BODY = '上午：与研发对齐上线排期，确认灰度方案与时间窗。'.repeat(40);

test('笔记写入后完整读回：正文 / 清单 / 标签无损', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  await db.putNote(sampleRecord('r1', '完成 Q3 新品上线方案', LONG_BODY), 1_800_000_000_000);

  const rec = await db.getNote('r1');
  assert.ok(rec, '应能读回记录');
  assert.equal(rec.id, 'r1');
  assert.equal(rec.title, '完成 Q3 新品上线方案');
  assert.equal(rec.body, LONG_BODY, '长正文经压缩往返后必须完全一致');
  assert.equal(rec.checklist.length, 2);
  assert.equal(rec.checklist[0].t, '拉齐研发排期');
  assert.equal(rec.checklist[0].c, true);
  assert.deepEqual(rec.tags, ['重要', '跟进']);
  assert.equal(rec.priority, 1);
  assert.equal(rec.update_time, 1_800_000_000_000);
});

test('列表查询只返回轻量字段，不加载压缩正文', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  await db.putManyNotes([
    sampleRecord('r1', '第一条', LONG_BODY),
    sampleRecord('r2', '第二条', '短正文'),
  ], 1_000);

  const rows = await db.listNotes();
  assert.equal(rows.length, 2);
  rows.forEach((r) => {
    assert.equal(r.content_compressed, undefined, '列表行不得携带压缩正文');
    assert.equal(r.style_data, undefined, '列表行不得携带样式数据');
    assert.ok(r.id && r.title !== undefined, '列表仍需 id 与 title');
  });
  // 按 update_time 倒序
  assert.ok(rows[0].update_time >= rows[1].update_time);
});

test('按 id 覆盖写入（put 语义），不会产生重复记录', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  await db.putNote(sampleRecord('r1', '原标题', '原正文'), 1_000);
  await db.putNote(sampleRecord('r1', '新标题', '新正文'), 2_000);

  const rows = await db.listNotes();
  assert.equal(rows.length, 1, '同 id 应覆盖而非新增');
  const rec = await db.getNote('r1');
  assert.equal(rec.title, '新标题');
  assert.equal(rec.body, '新正文');
  assert.equal(rec.update_time, 2_000);
});

test('删除笔记：正文与元数据一并移除，不留残行', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  await db.putNote(sampleRecord('r1', '待删除', LONG_BODY), 1_000);
  await db.putNote(sampleRecord('r2', '保留', '正文'), 2_000);

  await db.deleteNote('r1');

  assert.equal(await db.getNote('r1'), null, '删除后应读不到');
  const rows = await db.listNotes();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'r2');
  // 正文表也要清掉，否则成为无法定位的垃圾
  const content = await getRow(db, STORES.contents, 'r1');
  assert.equal(content, undefined, '正文行必须一并删除');
});

test('删除笔记级联删除关联图片', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  await db.putNote(sampleRecord('r1', '带图笔记', '正文'), 1_000);

  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' });
  const hash = await sha256Hex(blob);
  const imgRow = buildImageRow({
    id: makeImageId(1_000, 111), hash, fullBlob: blob, thumbBlob: blob,
    width: 1080, height: 810, created: 1_000,
  }, 'r1');
  await putRow(db, STORES.images, imgRow);
  assert.equal((await db.getImagesOf('r1')).length, 1);

  const res = await db.deleteNote('r1');
  assert.equal(res.images, 1, '应报告删除了 1 张图片');
  assert.equal((await db.getImagesOf('r1')).length, 0, '图片记录必须随笔记删除');
});

test('图片按 SHA-256 去重：同内容查出同一条记录', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  const bytes = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const blobA = new Blob([bytes], { type: 'image/webp' });
  const blobB = new Blob([bytes], { type: 'image/webp' });   // 内容完全相同

  const hashA = await sha256Hex(blobA);
  const hashB = await sha256Hex(blobB);
  assert.equal(hashA, hashB, '相同内容必须得到相同哈希');
  assert.equal(hashA.length, 64, 'SHA-256 应为 64 位十六进制');

  await db.putNote(sampleRecord('r1', '笔记', '正文'), 1_000);
  await putRow(db, STORES.images, buildImageRow({
    id: 'img_1', hash: hashA, fullBlob: blobA, thumbBlob: blobA,
    width: 1080, height: 810, created: 1_000,
  }, 'r1'));

  const found = await db.findImageByHash(hashB);
  assert.ok(found, '同哈希应命中已有记录');
  assert.equal(found.id, 'img_1', '命中后复用旧 id，不额外占用空间');

  const other = await sha256Hex(new Blob([new Uint8Array([1, 1, 1, 1])]));
  assert.equal(await db.findImageByHash(other), null, '不同内容不应命中');
});

test('meta 表：folders / events / settings 可读写', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  await db.setMeta('folders', { work: { name: '工作', parent: null } });
  await db.setMeta('events', [{ id: 'e1', name: '生日' }]);
  await db.setMeta('settings', { theme: 'dark', soundOn: true });

  assert.deepEqual(await db.getMeta('folders'), { work: { name: '工作', parent: null } });
  assert.equal((await db.getMeta('events')).length, 1);
  assert.equal((await db.getMeta('settings')).theme, 'dark');

  const all = await db.getAllMeta();
  assert.deepEqual(Object.keys(all).sort(), ['events', 'folders', 'settings']);
  assert.equal(await db.getMeta('不存在的键'), undefined);

  // 覆盖写入
  await db.setMeta('settings', { theme: 'light', soundOn: false });
  assert.equal((await db.getMeta('settings')).theme, 'light');
});

test('relinkImages：把「先选图后保存」的图片归属回填到笔记', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  const rec = sampleRecord('r1', '先选图后保存', '正文');
  rec.image_id = 'img_1';
  await db.putNote(rec, 1_000);

  const blob = new Blob([new Uint8Array([5, 5, 5])], { type: 'image/webp' });
  // 模拟图片先于笔记入库：note_id 还是 null
  await putRow(db, STORES.images, buildImageRow({
    id: 'img_1', hash: await sha256Hex(blob), fullBlob: blob, thumbBlob: blob,
    width: 1080, height: 810, created: 1_000,
  }, null));

  assert.equal((await db.getImage('img_1')).note_id, null, '初始无归属');
  const changed = await db.relinkImages();
  assert.equal(changed, 1, '应修正 1 条归属');
  assert.equal((await db.getImage('img_1')).note_id, 'r1', '归属已回填');

  // 再次调用应无变化（幂等）
  assert.equal(await db.relinkImages(), 0);
});

test('cleanupOrphanImages：清理无笔记引用的图片，保留被引用的', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  await db.putNote(sampleRecord('r1', '笔记', '正文'), 1_000);

  const mkBlob = (n) => new Blob([new Uint8Array([n])], { type: 'image/webp' });
  await putRow(db, STORES.images, buildImageRow({
    id: 'img_keep', hash: await sha256Hex(mkBlob(1)), fullBlob: mkBlob(1), thumbBlob: mkBlob(1),
    width: 10, height: 10, created: 1_000,
  }, 'r1'));
  await putRow(db, STORES.images, buildImageRow({
    id: 'img_orphan', hash: await sha256Hex(mkBlob(2)), fullBlob: mkBlob(2), thumbBlob: mkBlob(2),
    width: 10, height: 10, created: 1_000,
  }, '已删除的笔记'));

  const removed = await db.cleanupOrphanImages();
  assert.equal(removed, 1, '只清理孤儿');
  assert.ok(await db.getImage('img_keep'), '被引用的图片必须保留');
  assert.equal(await db.getImage('img_orphan'), null, '孤儿图片应被清理');
});

test('imageStats：按 Blob 实际字节统计张数与占用', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  assert.deepEqual(await db.imageStats(), { count: 0, bytes: 0 });

  await db.putNote(sampleRecord('r1', '笔记', '正文'), 1_000);
  const big = new Blob([new Uint8Array(1000)]);
  const small = new Blob([new Uint8Array(64)]);
  await putRow(db, STORES.images, buildImageRow({
    id: 'img_1', hash: 'h1', fullBlob: big, thumbBlob: small,
    width: 1080, height: 810, created: 1_000,
  }, 'r1'));

  const stats = await db.imageStats();
  assert.equal(stats.count, 1);
  assert.equal(stats.bytes, 1064, '大图 + 缩略图之和');
});

test('两个连接实例共享同一份数据（等同于重开 App）', { skip: !available && '需要 npm install' }, async () => {
  const name = `${IDB_NAME}-shared-${Date.now()}-${seq++}`;
  const a = new NoteDB({ name });
  await a.putNote(sampleRecord('r1', '持久化验证', LONG_BODY), 1_000);

  // 模拟重启：新建一个连接（旧连接不复用）
  const b = new NoteDB({ name });
  const rec = await b.getNote('r1');
  assert.ok(rec, '重开后数据仍应可读');
  assert.equal(rec.body, LONG_BODY, '正文应完整恢复');
  assert.equal(rec.title, '持久化验证');
});

test('recordToRow 产出的行可直接落库并被 getNote 读回', { skip: !available && '需要 npm install' }, async () => {
  const db = freshDB();
  const rec = sampleRecord('r1', '端到端', '含中文与 emoji 🎉 的正文'.repeat(20));
  const row = recordToRow(rec, 1_000);
  assert.ok(row.content_compressed instanceof Uint8Array, '正文必须是压缩后的二进制');

  await db.putNote(rec, 1_000);
  const back = await db.getNote('r1');
  assert.equal(back.body, rec.body, '含 emoji 的正文也应无损往返');
  assert.deepEqual(back.checklist, rec.checklist);
});
