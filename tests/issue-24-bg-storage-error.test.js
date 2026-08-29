// Issue-24: 自定义背景点「相册」后提示「存储空间不足」，但用户手机空间充足
// 根因：背景图以原始分辨率 dataURL 存入 localStorage。
//   localStorage 配额通常仅约 5MB，而一张手机照片 base64 后可达 5~15MB，
//   写入时抛 QuotaExceededError，被 saveDB 统一 catch 后提示成
//   「保存失败：本地存储空间不足（图片可能过多）」——误导用户以为手机没空间。
// 修复：
//   1) 背景上传时先压缩（等比缩放到最大边长 + JPEG 质量），再存储
//   2) saveDB 区分「本地存储配额已满」与其他错误，给出准确说明
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  formatBytes,
  estimateDataUrlBytes,
  computeResize,
  isQuotaError,
  describeStorageError,
  IMAGE_LIMITS,
} from '../src/app-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'work-memo-app.html'), 'utf8');

/* ---------- formatBytes ---------- */

test('formatBytes 按量级切换单位', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
  assert.equal(formatBytes(-1), '0 B');
});

/* ---------- estimateDataUrlBytes ---------- */

test('estimateDataUrlBytes 按 base64 规则估算字节数', () => {
  // 4 个 base64 字符 = 3 字节
  assert.equal(estimateDataUrlBytes('data:image/png;base64,AAAA'), 3);
  // 末尾 '==' 表示只有 1 个有效字节
  assert.equal(estimateDataUrlBytes('data:image/png;base64,AA=='), 1);
  // 末尾单个 '=' 表示 2 个有效字节
  assert.equal(estimateDataUrlBytes('data:image/png;base64,AAA='), 2);
});

test('estimateDataUrlBytes 容错：空值/非字符串/含空白', () => {
  assert.equal(estimateDataUrlBytes(null), 0);
  assert.equal(estimateDataUrlBytes(undefined), 0);
  assert.equal(estimateDataUrlBytes(''), 0);
  assert.equal(estimateDataUrlBytes(12345), 0);
  // data URL 中的换行/空格应被忽略
  assert.equal(estimateDataUrlBytes('data:image/png;base64,AA\nAA'), 3);
});

test('estimateDataUrlBytes 能反映原图确实会撑爆配额', () => {
  // 模拟一张 6MB 照片转成的 dataURL（约 800 万 base64 字符）
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(8_000_000);
  const bytes = estimateDataUrlBytes(big);
  assert.ok(bytes > 5 * 1024 * 1024, '6MB 照片的 dataURL 应超过 5MB 配额，bytes=' + bytes);
});

/* ---------- computeResize ---------- */

test('computeResize 等比缩放到最大边长', () => {
  assert.deepEqual(computeResize(4000, 3000, 1280), { width: 1280, height: 960, changed: true });
  assert.deepEqual(computeResize(3000, 4000, 1280), { width: 960, height: 1280, changed: true });
});

test('computeResize 不放大小于限制的图片', () => {
  assert.deepEqual(computeResize(800, 600, 1280), { width: 800, height: 600, changed: false });
});

test('computeResize 容错：非法尺寸或非法限制', () => {
  assert.deepEqual(computeResize(0, 0, 1280), { width: 0, height: 0, changed: false });
  assert.deepEqual(computeResize(100, 100, 0), { width: 100, height: 100, changed: false });
  assert.deepEqual(computeResize(NaN, 100, 1280), { width: 0, height: 0, changed: false });
});

/* ---------- isQuotaError ---------- */

test('isQuotaError 识别各浏览器的配额错误', () => {
  assert.equal(isQuotaError({ name: 'QuotaExceededError' }), true);
  assert.equal(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(isQuotaError({ code: 22 }), true);
  assert.equal(isQuotaError({ code: 1014 }), true);
});

test('isQuotaError 不误判普通错误', () => {
  assert.equal(isQuotaError({ name: 'TypeError' }), false);
  assert.equal(isQuotaError(new Error('boom')), false);
  assert.equal(isQuotaError(null), false);
  assert.equal(isQuotaError(undefined), false);
});

/* ---------- describeStorageError ---------- */

test('配额错误的提示必须说明「不是手机存储空间不足」', () => {
  const msg = describeStorageError({ name: 'QuotaExceededError' });
  assert.match(msg, /本地存储配额已满/, '应明确指出是本地存储配额');
  assert.match(msg, /不是手机存储空间不足/, '必须显式澄清不是手机存储空间问题');
  assert.match(msg, /建议/, '应给出可操作的建议');
});

test('非配额错误返回通用保存失败提示', () => {
  assert.equal(describeStorageError(new Error('disk on fire')), '保存失败：disk on fire');
  assert.equal(describeStorageError(null), '保存失败：未知原因');
});

/* ---------- 源码接线 ---------- */

test('saveDB 不再笼统提示「存储空间不足」，改为区分配额错误', () => {
  assert.ok(
    !html.includes('保存失败：本地存储空间不足（图片可能过多）'),
    '不应再用会误导用户的旧提示'
  );
  assert.match(html, /isQuotaError\(e\)/, 'saveDB 应判断是否配额错误');
  assert.match(html, /describeStorageError\(e\)/, 'saveDB 应使用准确的错误描述');
});

test('背景上传先压缩再存储', () => {
  assert.match(html, /function compressImageFile\(/, '缺少图片压缩函数');
  assert.match(html, /compressImageFile\(file, IMAGE_LIMITS\.bgMaxDim, IMAGE_LIMITS\.bgQuality\)/, '背景上传应走压缩');
  assert.match(html, /canvas\.toDataURL\('image\/jpeg', quality\)/, '应输出 JPEG 以显著减小体积');
  assert.match(html, /computeResize\(img\.naturalWidth, img\.naturalHeight, maxDim\)/, '应按最大边长等比缩放');
});

test('背景设置成功时告知压缩前后大小', () => {
  assert.match(html, /estimateDataUrlBytes\(dataUrl\)/, '应估算压缩后体积');
  assert.match(html, /背景已设置：/, '应提示压缩前后大小，让用户感知已优化');
});

test('压缩参数存在且合理（不会把背景压得过小）', () => {
  assert.ok(IMAGE_LIMITS.bgMaxDim >= 720, '背景最长边至少 720，保证清晰度');
  assert.ok(IMAGE_LIMITS.bgQuality > 0 && IMAGE_LIMITS.bgQuality < 1, 'JPEG 质量应在 0~1 之间');
  assert.ok(IMAGE_LIMITS.maxStoredBytes >= 256 * 1024, '单张上限不应过小');
});
