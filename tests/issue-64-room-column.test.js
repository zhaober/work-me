// issue-64: Excel 导入把「教室类别」误当成上课地点
// 江西农业大学教务导出的课表含「上课地点」(E-514) 与「教室类别」(多媒体) 两列，
// 旧逻辑 /上课地点|地点|教室/ 逐列覆盖，最终取到教室类别。
// pickRoomColumn 按优先级选择且排除"教室类别/教室类型"。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickRoomColumn } from '../src/schedule-core.js';

// 用户提供的教务课表真实表头（江西农业大学 2025-2026 学年第二学期课程表）
const JXAU_HEADERS = ['序号', '课程名称', '任课老师', '上课时间', '上课周', '上课地点', '上课对象', '人数', '类别', '教室类别'];

test('真实教务表头：取「上课地点」列(index 5)，而非「教室类别」(index 9)', () => {
  assert.equal(pickRoomColumn(JXAU_HEADERS), 5);
});

test('只有「地点」列时取地点', () => {
  assert.equal(pickRoomColumn(['课程', '时间', '地点']), 2);
});

test('只有「教室」列时仍取教室（兜底）', () => {
  assert.equal(pickRoomColumn(['课程', '时间', '教室']), 2);
});

test('只有「教室类别」而无真实地点列时不误取（返回 -1）', () => {
  assert.equal(pickRoomColumn(['课程', '时间', '教室类别']), -1);
});

test('「教室类型」同样被排除', () => {
  assert.equal(pickRoomColumn(['课程', '时间', '上课地点', '教室类型']), 2);
});

test('无任何地点相关列返回 -1', () => {
  assert.equal(pickRoomColumn(['课程', '时间', '老师']), -1);
});

test('HTML 导入逻辑改用 pickRoomColumn 且已引入', () => {
  const HTML = readFileSync(new URL('../work-memo-app.html', import.meta.url), 'utf8');
  assert.match(HTML, /colMap\.room = pickRoomColumn\(headers\);/);
  assert.doesNotMatch(HTML, /\/上课地点\|地点\|教室\/\.test\(h\)/, '旧的逐列覆盖逻辑应已移除');
  assert.match(HTML, /pickRoomColumn } from '\.\/src\/schedule-core\.js';/);
});

test('schedule-core.js 与 Capacitor www 镜像一致（APK 不缺文件）', () => {
  const main = readFileSync(new URL('../src/schedule-core.js', import.meta.url), 'utf8');
  const mirror = readFileSync(new URL('../WorkMemoApp/www/src/schedule-core.js', import.meta.url), 'utf8');
  assert.equal(main, mirror);
});
