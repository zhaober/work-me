// Issue-27: 用户数据增长快、存储占用高（没设很多文件夹却很快占满）。
// 根因：记录内图片以原始分辨率 dataURL 直接存入 localStorage，一张手机照片即可数 MB，
//   而 localStorage 配额通常仅约 5MB，导致存储迅速撑满。
// 修复：
//   1) 记录内图片在插入时即压缩（与背景图同样策略）
//   2) 「我的」展示图片已占空间，并提供「优化存储」一键重新压缩大图
//   3) 纯函数 sumImageBytes / shouldCompressImage / countLargeImages / estimateStringBytes 支撑统计与判定
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  RECORD_IMAGE_LIMITS,
  estimateStringBytes,
  sumImageBytes,
  shouldCompressImage,
  countLargeImages,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

// 构造模拟 dataURL：1 个字符 ≈ 0.75 字节，用于稳定断言
const img1 = 'data:image/jpeg;base64,' + 'A'.repeat(440_000);   // ≈ 330KB（超过 300KiB 阈值）
const img2 = 'data:image/jpeg;base64,' + 'A'.repeat(800_000);   // ≈ 600KB
const imgSmall = 'data:image/jpeg;base64,' + 'A'.repeat(10_000); // ≈ 7.5KB

/* ---------- RECORD_IMAGE_LIMITS ---------- */

test('记录图片限制合理：边长适中、JPEG 质量、优化阈值', () => {
  assert.ok(RECORD_IMAGE_LIMITS.maxDim >= 1280, '记录图最长边不低于背景');
  assert.ok(RECORD_IMAGE_LIMITS.quality > 0.7 && RECORD_IMAGE_LIMITS.quality < 1, 'JPEG 质量应在合理区间');
  assert.ok(RECORD_IMAGE_LIMITS.compressAboveBytes >= 200 * 1024, '优化阈值不应过低');
});

/* ---------- estimateStringBytes ---------- */

test('estimateStringBytes 按 UTF-16 估算写入字节', () => {
  assert.equal(estimateStringBytes('abc'), 6);
  assert.equal(estimateStringBytes(''), 0);
  assert.equal(estimateStringBytes(null), 0);
  assert.equal(estimateStringBytes(123), 0);
});

/* ---------- sumImageBytes ---------- */

test('sumImageBytes 累加所有记录图片占用，忽略无图记录', () => {
  const records = {
    a: { image: img1 },
    b: { image: img2 },
    c: { body: 'no image' },
    d: { image: imgSmall },
  };
  const expected = 330_000 + 600_000 + 7_500; // 近似（base64 估算）
  assert.ok(Math.abs(sumImageBytes(records) - expected) < 4, 'sum=' + sumImageBytes(records));
});

test('sumImageBytes 对空/非法输入安全返回 0', () => {
  assert.equal(sumImageBytes(null), 0);
  assert.equal(sumImageBytes({}), 0);
  assert.equal(sumImageBytes(undefined), 0);
});

/* ---------- shouldCompressImage ---------- */

test('shouldCompressImage 超过阈值才需压缩', () => {
  const threshold = 300 * 1024;
  assert.equal(shouldCompressImage(img1, threshold), true, '≈300KB 超过阈值');
  assert.equal(shouldCompressImage(imgSmall, threshold), false, '小图无需压缩');
  assert.equal(shouldCompressImage('', threshold), false, '空图不压缩');
  assert.equal(shouldCompressImage(img1, 0), false, '非法阈值返回 false');
});

/* ---------- countLargeImages ---------- */

test('countLargeImages 统计超过阈值的图片数量与总占用', () => {
  const threshold = 300 * 1024;
  const records = { a: { image: img1 }, b: { image: img2 }, c: { image: imgSmall } };
  const r = countLargeImages(records, threshold);
  assert.equal(r.count, 2, '应识别出 2 张大图');
  assert.ok(r.totalBytes >= 900_000, '总占用应≈900KB，实际=' + r.totalBytes);
});

test('countLargeImages 阈值为 0 时统计全部图片', () => {
  const records = { a: { image: img1 }, b: { image: imgSmall } };
  assert.equal(countLargeImages(records, 0).count, 2);
  assert.equal(countLargeImages(null, 100).count, 0);
});

/* ---------- 源码接线 ---------- */

test('import 列表已引入存储优化纯函数', () => {
  assert.match(html, /RECORD_IMAGE_LIMITS/, '应导入记录图限制');
  assert.match(html, /sumImageBytes/, '应导入用量统计');
  assert.match(html, /shouldCompressImage/, '应导入压缩判定');
});

// 注意：以下三例已被 Issue-30 的架构升级覆盖（详见 tests/issue-30-idb-wiring.test.js）。
// Issue-27 的做法是「dataURL 入库时压缩」；Issue-30 之后图片以 WebP Blob 存 IndexedDB，
// 根本不再进入业务数据，因此这里改为断言新机制，旧断言不再适用。
test('记录图片以 WebP Blob 入库，不再以 dataURL 进入业务数据', () => {
  // 旧实现：直接 readAsDataURL 后塞进 editing.data.image（原始体积）
  assert.ok(!html.includes("rd.readAsDataURL(file); this.value='';"), '不应再直接读原图塞入');
  // 新实现：走压缩 + 去重管线，记录上只留 image_ids 外键数组（多图改造后）
  assert.match(html, /await noteDB\.saveImage\(noteId, picked\[i\]\)/, 'imgFile 应走压缩去重管线');
  assert.match(html, /editing\.data\.image_ids = normalizeImageIds\(ids\)/, '记录只保存图片 id 数组外键');
  const pick = html.slice(html.indexOf('async function handleImagePick'), html.indexOf('function compressImageFile'));
  assert.doesNotMatch(pick, /editing\.data\.image=dataUrl/, '不得再把 Base64 写进记录');
});

test('「我的」展示图片占用并提供优化入口', () => {
  assert.match(html, /data-optimize/, '应存在优化存储入口');
  // 图片已不是 dataURL，占用需从 IndexedDB 的 Blob 统计
  assert.match(html, /imageStatsCache\.bytes/, '应展示图片已占空间');
  assert.match(html, /formatBytes\(imageStatsCache\.bytes\)/, '用量应以可读单位展示');
});

test('optimizeStorage 清理孤儿图片（图片入库即压缩，无需二次压缩）', () => {
  assert.match(html, /async function optimizeStorage\(\)/, '应存在优化函数');
  assert.match(html, /await noteDB\.imageStats\(\)/, '先统计当前图片占用');
  assert.match(html, /cleanupOrphanImages\(\)/, '清理不再被引用的图片');
  const opt = html.slice(html.indexOf('async function optimizeStorage'), html.indexOf('async function optimizeStorage') + 900);
  assert.doesNotMatch(opt, /toDataURL\('image\/jpeg'/, '不再做二次 dataURL 压缩');
});
