/**
 * 工作计划与复盘备忘录 App - IndexedDB 数据层
 *
 * 设计要点（对应存储规格）：
 *  - 业务数据全部走 IndexedDB，不再用 localStorage（5MB 上限 / 只能存字符串）
 *  - 正文经 lz-string 压成 Uint8Array，存在独立的 note_contents 表，
 *    列表查询只扫 notes 表，不把全库正文拉进内存
 *  - 图片以 WebP Blob 直接入库（不是 Base64，避免 33% 体积膨胀与内存翻倍）
 *  - 入库前按 SHA-256 去重，重复图片只复用记录 id，不再占第二份空间
 *  - IndexedDB 不可用时由调用方降级（见 work-memo-app.html）
 */
import {
  IDB_NAME,
  IDB_VERSION,
  STORES,
  IMAGE_PIPELINE,
  computeResize,
  computeThumbRect,
  toHex,
  fallbackHashBytes,
  dedupeDecision,
  buildImageRow,
  makeImageId,
  recordToRow,
  rowToRecord,
  splitNoteRow,
  mergeNoteRows,
} from './app-core.js';

/** 把 IDBRequest 包成 Promise */
function wrap(request) {
  return new Promise(function (resolve, reject) {
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

/** 事务完成（complete）再 resolve，确保写盘真正落定 */
function done(tx) {
  return new Promise(function (resolve, reject) {
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error || new Error('事务被中止')); };
  });
}

/**
 * 探测浏览器是否支持某种 canvas 导出格式。
 * 注意：这里的 toDataURL 只作用于 1×1 画布做特性探测（几个字节），
 * 与「禁止用 toDataURL 存图」不冲突——存图路径一律走 toBlob。
 */
export function supportsImageType(type) {
  try {
    var cv = document.createElement('canvas');
    cv.width = 1; cv.height = 1;
    return cv.toDataURL(type).indexOf('data:' + type) === 0;
  } catch (e) {
    return false;
  }
}

/** 载入图片源：优先 createImageBitmap（更快、可后台解码），不可用时回落 Image 元素 */
function loadImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(function () { return loadViaImgElement(file); });
  }
  return loadViaImgElement(file);
}

function loadViaImgElement(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}

/** 把图片源绘制到离屏 canvas 并导出 Blob（toBlob，绝不 toDataURL） */
function drawToBlob(source, dw, dh, rect, type, quality) {
  return new Promise(function (resolve, reject) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, dw);
    cv.height = Math.max(1, dh);
    var ctx = cv.getContext('2d');
    if (!ctx) { reject(new Error('canvas 不可用')); return; }
    if (rect && rect.sw > 0 && rect.sh > 0) {
      ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, cv.width, cv.height);
    } else {
      ctx.drawImage(source, 0, 0, cv.width, cv.height);
    }
    cv.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error('图片导出失败'));
    }, type, quality);
  });
}

/**
 * 图片压缩主流程：
 *   原图 → 大图（长边 1080，WebP 75%）→ 缩略图（200×200 居中裁剪，WebP 65%）→ SHA-256 哈希
 * @param {Blob|File} file 原始图片
 * @returns {Promise<{fullBlob:Blob, thumbBlob:Blob, hash:string, width:number, height:number, type:string}>}
 */
export async function compressImage(file) {
  if (!file) throw new Error('缺少图片文件');
  var source = await loadImageSource(file);
  var sw = source.width || source.naturalWidth || 0;
  var sh = source.height || source.naturalHeight || 0;
  if (!sw || !sh) throw new Error('无法读取图片尺寸');

  // WebP 不被支持时（部分旧 Safari）回落 JPEG，避免静默降级成 PNG 反而更大
  var fullType = supportsImageType(IMAGE_PIPELINE.fullType)
    ? IMAGE_PIPELINE.fullType : IMAGE_PIPELINE.fallbackType;
  var thumbType = supportsImageType(IMAGE_PIPELINE.thumbType)
    ? IMAGE_PIPELINE.thumbType : IMAGE_PIPELINE.fallbackType;

  var full = computeResize(sw, sh, IMAGE_PIPELINE.fullMaxDim);
  var fullBlob = await drawToBlob(source, full.width, full.height, null,
    fullType, IMAGE_PIPELINE.fullQuality);

  var rect = computeThumbRect(sw, sh);
  var thumbBlob = await drawToBlob(source, IMAGE_PIPELINE.thumbSize, IMAGE_PIPELINE.thumbSize,
    rect, thumbType, IMAGE_PIPELINE.thumbQuality);

  if (source && typeof source.close === 'function') source.close();

  var hash = await sha256Hex(fullBlob);
  return {
    fullBlob: fullBlob,
    thumbBlob: thumbBlob,
    hash: hash,
    width: full.width,
    height: full.height,
    sourceWidth: sw,
    sourceHeight: sh,
    type: fullType,
  };
}

/**
 * 计算 Blob 的 SHA-256 十六进制串（用于全局去重）。
 * 非安全上下文（crypto.subtle 不可用）时回落 FNV 指纹，保证功能不中断。
 */
export async function sha256Hex(blob) {
  var bytes = new Uint8Array(await blob.arrayBuffer());
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      var digest = await crypto.subtle.digest(IMAGE_PIPELINE.hashAlgo, bytes);
      return toHex(new Uint8Array(digest));
    } catch (e) { /* 落到下面的兜底 */ }
  }
  return toHex(fallbackHashBytes(bytes));
}

/**
 * IndexedDB 数据层。
 * 表结构：
 *   notes          {id, type, folderId, title, date, time, reminder, priority, image_id, update_time}
 *   note_contents  {id, content_compressed, style_data}
 *   note_images    {id, note_id, hash_sha(唯一), blob_full, blob_thumb, w, h, bytes, created}
 *   meta           {k, v}   —— folders / events / settings
 */
export class NoteDB {
  constructor(options) {
    var o = options || {};
    this.name = o.name || IDB_NAME;
    this.version = o.version || IDB_VERSION;
    this.db = null;
  }

  /** 打开（并按需建表）数据库；重复调用返回同一个连接 */
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持 IndexedDB'));
        return;
      }
      var request = indexedDB.open(this.name, this.version);
      request.onupgradeneeded = () => {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORES.notes)) {
          var notes = db.createObjectStore(STORES.notes, { keyPath: 'id' });
          notes.createIndex('by_update', 'update_time');
          notes.createIndex('by_folder', 'folderId');
          notes.createIndex('by_date', 'date');
        }
        if (!db.objectStoreNames.contains(STORES.contents)) {
          db.createObjectStore(STORES.contents, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.images)) {
          var images = db.createObjectStore(STORES.images, { keyPath: 'id' });
          images.createIndex('by_hash', 'hash_sha', { unique: true });
          images.createIndex('by_note', 'note_id');
        }
        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: 'k' });
        }
      };
      request.onsuccess = () => { this.db = request.result; resolve(this.db); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('数据库被其他标签页占用'));
    });
  }

  store(name, mode) {
    return this.db.transaction(name, mode).objectStore(name);
  }

  /** 写入一条笔记（元数据 + 正文分表写入，同一事务保证一致） */
  async putNote(record, nowMs) {
    await this.open();
    var row = recordToRow(record, nowMs);
    var parts = splitNoteRow(row);
    return new Promise((resolve, reject) => {
      var tx = this.db.transaction([STORES.notes, STORES.contents], 'readwrite');
      tx.objectStore(STORES.notes).put(parts.meta);
      tx.objectStore(STORES.contents).put(parts.content);
      done(tx).then(() => resolve(row.update_time)).catch(reject);
    });
  }

  /** 批量写入（迁移 / 导入用），全部放一个事务，比逐条快得多 */
  async putManyNotes(records, nowMs) {
    await this.open();
    var list = records || [];
    if (!list.length) return 0;
    return new Promise((resolve, reject) => {
      var tx = this.db.transaction([STORES.notes, STORES.contents], 'readwrite');
      var notes = tx.objectStore(STORES.notes);
      var contents = tx.objectStore(STORES.contents);
      list.forEach(function (rec) {
        var parts = splitNoteRow(recordToRow(rec, nowMs));
        notes.put(parts.meta);
        contents.put(parts.content);
      });
      done(tx).then(() => resolve(list.length)).catch(reject);
    });
  }

  /**
   * 读取一条完整笔记（按 id 精确获取，元数据 + 正文合并后解压）。
   * 列表页请不要用这个方法，改走 listNotes()。
   */
  async getNote(id) {
    await this.open();
    var tx = this.db.transaction([STORES.notes, STORES.contents], 'readonly');
    var metaReq = tx.objectStore(STORES.notes).get(id);
    var contentReq = tx.objectStore(STORES.contents).get(id);
    var meta = await wrap(metaReq);
    var content = await wrap(contentReq);
    if (!meta) return null;
    return rowToRecord(mergeNoteRows(meta, content));
  }

  /**
   * 列表查询：只读 notes 表，返回轻量行（不含正文/样式/图片 Blob）。
   * IndexedDB 游标总是一次性取出整行，所以「不加载正文」只能靠分表实现。
   */
  async listNotes() {
    await this.open();
    var rows = await wrap(this.store(STORES.notes, 'readonly').getAll());
    return (rows || []).slice().sort(function (a, b) {
      return (b.update_time || 0) - (a.update_time || 0);
    });
  }

  /**
   * 删除笔记：先删关联图片记录，再删正文，最后删元数据
   * （顺序不可颠倒，否则中途失败会留下无法定位的孤儿 Blob）
   */
  async deleteNote(id) {
    await this.open();
    var removed = await this.deleteImagesOf(id);
    return new Promise((resolve, reject) => {
      var tx = this.db.transaction([STORES.notes, STORES.contents], 'readwrite');
      tx.objectStore(STORES.contents).delete(id);
      tx.objectStore(STORES.notes).delete(id);
      done(tx).then(() => resolve({ images: removed })).catch(reject);
    });
  }

  /**
   * 保存图片：压缩 → 算哈希 → 命中则复用，否则新存。
   * @returns {Promise<{imageId:string, deduped:boolean, bytes:number, width:number, height:number}>}
   */
  async saveImage(noteId, file) {
    await this.open();
    var info = await compressImage(file);
    var existing = await this.findImageByHash(info.hash);
    var decision = dedupeDecision(existing);

    if (decision.action === 'reuse') {
      // 哈希已存在：放弃本次 Blob 存储，只复用旧记录 id（跨笔记去重）
      return {
        imageId: decision.imageId,
        deduped: true,
        bytes: 0,
        width: existing ? existing.w : info.width,
        height: existing ? existing.h : info.height,
        hash: info.hash,
      };
    }

    var row = buildImageRow({
      id: makeImageId(Date.now()),
      hash: info.hash,
      fullBlob: info.fullBlob,
      thumbBlob: info.thumbBlob,
      width: info.width,
      height: info.height,
      created: Date.now(),
    }, noteId);

    await wrap(this.store(STORES.images, 'readwrite').put(row));
    return {
      imageId: row.id,
      deduped: false,
      bytes: row.bytes,
      width: row.w,
      height: row.h,
      hash: row.hash_sha,
    };
  }

  /** 按哈希查重（唯一索引） */
  async findImageByHash(hash) {
    if (!hash) return null;
    await this.open();
    var idx = this.store(STORES.images, 'readonly').index('by_hash');
    var found = await wrap(idx.get(hash));
    return found || null;
  }

  async getImage(id) {
    if (!id) return null;
    await this.open();
    return (await wrap(this.store(STORES.images, 'readonly').get(id))) || null;
  }

  /** 取某条笔记关联的所有图片记录 */
  async getImagesOf(noteId) {
    if (!noteId) return [];
    await this.open();
    var idx = this.store(STORES.images, 'readonly').index('by_note');
    return (await wrap(idx.getAll(noteId))) || [];
  }

  /** 删除某条笔记名下的图片记录，返回删除数量 */
  async deleteImagesOf(noteId) {
    if (!noteId) return 0;
    await this.open();
    var images = await this.getImagesOf(noteId);
    if (!images.length) return 0;
    return new Promise((resolve, reject) => {
      var tx = this.db.transaction(STORES.images, 'readwrite');
      var store = tx.objectStore(STORES.images);
      images.forEach(function (img) { store.delete(img.id); });
      done(tx).then(() => resolve(images.length)).catch(reject);
    });
  }

  /**
   * 删除单张图片记录。
   * 调用方必须先确认没有其它笔记引用它 —— 哈希去重会让多条笔记共用同一张 Blob，
   * 直接删会把别人笔记里的图一起弄丢。
   */
  async deleteImage(id) {
    if (!id) return 0;
    await this.open();
    await wrap(this.store(STORES.images, 'readwrite').delete(id));
    return 1;
  }

  /**
   * 批量修正图片归属。
   * 场景：新建笔记时先选图、后保存 —— 此刻图片已入库但 note_id 还是 null，
   * 需在笔记落库后按 image_id 回填归属，否则会被当成孤儿清理掉。
   */
  async relinkImages() {
    await this.open();
    var notes = await this.listNotes();
    var owner = {};
    // 多图后用 image_ids 数组建归属；旧库行只有 image_id 单值时兜底成单元素数组，
    // 否则第 2 张及之后的图会因「找不到归属」被 cleanupOrphanImages 误删。
    notes.forEach(function (n) {
      var ids = Array.isArray(n.image_ids) ? n.image_ids : (n.image_id ? [n.image_id] : []);
      ids.forEach(function (id) { if (id) owner[id] = n.id; });
    });
    var images = (await wrap(this.store(STORES.images, 'readonly').getAll())) || [];
    var stale = images.filter(function (img) { return img.note_id !== owner[img.id]; });
    if (!stale.length) return 0;
    return new Promise((resolve, reject) => {
      var tx = this.db.transaction(STORES.images, 'readwrite');
      var store = tx.objectStore(STORES.images);
      stale.forEach(function (img) {
        // 去重复用的图片可能仍归原笔记所有，无新归属时保持不动
        if (owner[img.id]) img.note_id = owner[img.id];
        store.put(img);
      });
      done(tx).then(() => resolve(stale.length)).catch(reject);
    });
  }

  /** 图片仓库统计：张数与占用字节（供「我的」展示） */
  async imageStats() {
    await this.open();
    var rows = (await wrap(this.store(STORES.images, 'readonly').getAll())) || [];
    var bytes = 0;
    rows.forEach(function (r) { bytes += (r.bytes || 0); });
    return { count: rows.length, bytes: bytes };
  }

  /**
   * 清理孤儿图片：note_id 指向的笔记已不存在。
   * （跨笔记去重会复用图片记录，删掉持有者后可能残留，需定期清理）
   */
  async cleanupOrphanImages() {
    await this.open();
    var notes = await this.listNotes();
    var alive = {};
    notes.forEach(function (n) { alive[n.id] = true; });
    var images = await wrap(this.store(STORES.images, 'readonly').getAll());
    var orphans = (images || []).filter(function (img) { return !alive[img.note_id]; });
    if (!orphans.length) return 0;
    return new Promise((resolve, reject) => {
      var tx = this.db.transaction(STORES.images, 'readwrite');
      var store = tx.objectStore(STORES.images);
      orphans.forEach(function (img) { store.delete(img.id); });
      done(tx).then(() => resolve(orphans.length)).catch(reject);
    });
  }

  /* ---------- meta 表：folders / events / settings ---------- */

  async setMeta(key, value) {
    await this.open();
    return new Promise((resolve, reject) => {
      var tx = this.db.transaction(STORES.meta, 'readwrite');
      tx.objectStore(STORES.meta).put({ k: key, v: value });
      done(tx).then(resolve).catch(reject);
    });
  }

  async getMeta(key) {
    await this.open();
    var row = await wrap(this.store(STORES.meta, 'readonly').get(key));
    return row ? row.v : undefined;
  }

  /** 一次取出全部 meta（启动加载用） */
  async getAllMeta() {
    await this.open();
    var rows = (await wrap(this.store(STORES.meta, 'readonly').getAll())) || [];
    var out = {};
    rows.forEach(function (r) { out[r.k] = r.v; });
    return out;
  }

  /** 浏览器给的配额用量（用于「我的」展示；不支持时返回 null） */
  async estimateUsage() {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        return await navigator.storage.estimate();
      }
    } catch (e) { /* 忽略 */ }
    return null;
  }
}
