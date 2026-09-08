/**
 * 课表核心逻辑测试 —— schedule-core.js 纯函数验证
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PERIOD_BLOCKS,
  WEEKDAY_NAMES,
  COURSE_COLORS,
  getDefaultSchedule,
  normalizeSchedule,
  getCurrentWeek,
  isSessionActiveInWeek,
  parseTimeField,
  parseWeekField,
  parseTeacherField,
  sessionBlockIndices,
  colorForCourse,
  getWeekInfo,
  getSessionsForDay,
  getActiveSemester,
  newSessionId,
  newSemesterId,
} from '../src/schedule-core.js';

describe('DEFAULT_PERIOD_BLOCKS', () => {
  it('默认 5 个节次块', () => {
    assert.equal(DEFAULT_PERIOD_BLOCKS.length, 5);
  });
  it('每块有 id/label/timeLabel/periodStart/periodEnd', () => {
    for (const b of DEFAULT_PERIOD_BLOCKS) {
      assert.equal(typeof b.id, 'number');
      assert.equal(typeof b.label, 'string');
      assert.equal(typeof b.timeLabel, 'string');
      assert.equal(typeof b.periodStart, 'number');
      assert.equal(typeof b.periodEnd, 'number');
      assert.ok(b.periodStart <= b.periodEnd);
    }
  });
  it('时间格式正确', () => {
    for (const b of DEFAULT_PERIOD_BLOCKS) {
      assert.match(b.timeLabel, /^\d{2}:\d{2}-\d{2}:\d{2}$/);
    }
  });
});

describe('WEEKDAY_NAMES', () => {
  it('周一到周日 7 个名称', () => {
    assert.equal(WEEKDAY_NAMES.length, 7);
    assert.equal(WEEKDAY_NAMES[0], '周一');
    assert.equal(WEEKDAY_NAMES[6], '周日');
  });
});

describe('COURSE_COLORS', () => {
  it('至少 10 种颜色', () => {
    assert.ok(COURSE_COLORS.length >= 10);
  });
  it('颜色为合法十六进制', () => {
    for (const c of COURSE_COLORS) {
      assert.match(c, /^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('getDefaultSchedule', () => {
  it('返回包含 semesters/activeSemesterId/periodBlocks 的默认结构', () => {
    const s = getDefaultSchedule();
    assert.ok(typeof s.semesters === 'object');
    assert.equal(typeof s.activeSemesterId, 'string');
    assert.ok(Array.isArray(s.periodBlocks));
    assert.equal(s.periodBlocks.length, 5);
  });
});

describe('normalizeSchedule', () => {
  it('null 返回默认值', () => {
    const s = normalizeSchedule(null);
    assert.ok(Object.keys(s.semesters).length === 0);
    assert.equal(s.activeSemesterId, '');
    assert.equal(s.periodBlocks.length, 5);
  });
  it('undefined 返回默认值', () => {
    const s = normalizeSchedule(undefined);
    assert.equal(s.activeSemesterId, '');
  });
  it('保留已有数据', () => {
    const s = normalizeSchedule({
      semesters: { s1: { id: 's1', name: 'test' } },
      activeSemesterId: 's1',
      periodBlocks: [{ id: 0, label: 'X', timeLabel: '08:00-09:40', periodStart: 1, periodEnd: 2 }],
    });
    assert.equal(s.activeSemesterId, 's1');
    assert.equal(s.periodBlocks.length, 1);
  });
  it('periodBlocks 为空数组时用默认值', () => {
    const s = normalizeSchedule({ periodBlocks: [] });
    assert.equal(s.periodBlocks.length, 5);
  });
});

describe('getCurrentWeek', () => {
  it('无起始日期返回 1', () => {
    assert.equal(getCurrentWeek(''), 1);
  });
  it('起始日当天返回 1', () => {
    assert.equal(getCurrentWeek('2025-03-03', '2025-03-03'), 1);
  });
  it('第 7 天返回 2', () => {
    assert.equal(getCurrentWeek('2025-03-03', '2025-03-10'), 2);
  });
  it('早于开学返回 0', () => {
    assert.equal(getCurrentWeek('2025-03-03', '2025-02-28'), 0);
  });
  it('14 天后返回 3', () => {
    assert.equal(getCurrentWeek('2025-03-03', '2025-03-17'), 3);
  });
  it('无效日期返回 1', () => {
    assert.equal(getCurrentWeek('not-a-date', '2025-03-03'), 1);
  });
});

describe('isSessionActiveInWeek', () => {
  it('无课节返回 false', () => {
    assert.equal(isSessionActiveInWeek(null, 1, true), false);
  });
  it('无周次限制始终生效', () => {
    const s = { weeks: [], isOddEven: 'all' };
    assert.equal(isSessionActiveInWeek(s, 5, true), true);
  });
  it('周次匹配', () => {
    const s = { weeks: [[1, 16]], isOddEven: 'all' };
    assert.equal(isSessionActiveInWeek(s, 8, true), true);
    assert.equal(isSessionActiveInWeek(s, 20, true), false);
  });
  it('多段周次', () => {
    const s = { weeks: [[2, 5], [7, 9], [11, 17]], isOddEven: 'all' };
    assert.equal(isSessionActiveInWeek(s, 3, true), true);
    assert.equal(isSessionActiveInWeek(s, 6, true), false);
    assert.equal(isSessionActiveInWeek(s, 8, true), true);
    assert.equal(isSessionActiveInWeek(s, 10, true), false);
  });
  it('单周限制', () => {
    const s = { weeks: [[1, 16]], isOddEven: 'odd' };
    assert.equal(isSessionActiveInWeek(s, 3, true), true);
    assert.equal(isSessionActiveInWeek(s, 4, false), false);
  });
  it('双周限制', () => {
    const s = { weeks: [[1, 16]], isOddEven: 'even' };
    assert.equal(isSessionActiveInWeek(s, 4, false), true);
    assert.equal(isSessionActiveInWeek(s, 3, true), false);
  });
});

describe('parseTimeField', () => {
  it('解析星期一 上午 1-2节', () => {
    const r = parseTimeField('星期一 上午 1-2节');
    assert.deepEqual(r, { weekday: 0, periodStart: 1, periodEnd: 2 });
  });
  it('解析星期二 晚上 9-11节', () => {
    const r = parseTimeField('星期二 晚上 9-11节');
    assert.deepEqual(r, { weekday: 1, periodStart: 9, periodEnd: 11 });
  });
  it('解析星期三 白天 1-8节', () => {
    const r = parseTimeField('星期三 白天 1-8节');
    assert.deepEqual(r, { weekday: 2, periodStart: 1, periodEnd: 8 });
  });
  it('解析单节课', () => {
    const r = parseTimeField('星期四 上午 3节');
    assert.deepEqual(r, { weekday: 3, periodStart: 3, periodEnd: 3 });
  });
  it('周日', () => {
    const r = parseTimeField('星期日 上午 1-2节');
    assert.equal(r.weekday, 6);
  });
  it('无效输入返回 null', () => {
    assert.equal(parseTimeField(''), null);
    assert.equal(parseTimeField(null), null);
    assert.equal(parseTimeField('abc'), null);
  });
});

describe('parseWeekField', () => {
  it('解析 2-5,7-9,11-17', () => {
    const r = parseWeekField('2-5,7-9,11-17');
    assert.deepEqual(r, [[2, 5], [7, 9], [11, 17]]);
  });
  it('解析单周 17', () => {
    const r = parseWeekField('17');
    assert.deepEqual(r, [[17, 17]]);
  });
  it('解析离散周 1,6,8,10', () => {
    const r = parseWeekField('1,6,8,10');
    assert.deepEqual(r, [[1, 1], [6, 6], [8, 8], [10, 10]]);
  });
  it('中文逗号', () => {
    const r = parseWeekField('1-5，6-10');
    assert.deepEqual(r, [[1, 5], [6, 10]]);
  });
  it('顿号分隔', () => {
    const r = parseWeekField('1-5、6-10');
    assert.deepEqual(r, [[1, 5], [6, 10]]);
  });
  it('空字符串返回空数组', () => {
    assert.deepEqual(parseWeekField(''), []);
    assert.deepEqual(parseWeekField(null), []);
  });
});

describe('parseTeacherField', () => {
  it('解析 4724.徐媛', () => {
    assert.equal(parseTeacherField('4724.徐媛'), '徐媛');
  });
  it('解析多人 6226.马超、6181.李子琳', () => {
    assert.equal(parseTeacherField('6226.马超、6181.李子琳'), '马超、李子琳');
  });
  it('三人 6226.马超、6181.李子琳、5874.曹欢', () => {
    assert.equal(parseTeacherField('6226.马超、6181.李子琳、5874.曹欢'), '马超、李子琳、曹欢');
  });
  it('无前缀', () => {
    assert.equal(parseTeacherField('张三'), '张三');
  });
  it('空字符串', () => {
    assert.equal(parseTeacherField(''), '');
  });
});

describe('sessionBlockIndices', () => {
  const blocks = DEFAULT_PERIOD_BLOCKS;
  it('1-2节 在第1块', () => {
    assert.deepEqual(sessionBlockIndices(1, 2, blocks), [0]);
  });
  it('3-4节 在第2块', () => {
    assert.deepEqual(sessionBlockIndices(3, 4, blocks), [1]);
  });
  it('9-11节 在第5块', () => {
    assert.deepEqual(sessionBlockIndices(9, 11, blocks), [4]);
  });
  it('1-8节 跨 4 块', () => {
    assert.deepEqual(sessionBlockIndices(1, 8, blocks), [0, 1, 2, 3]);
  });
  it('1-11节 跨全部 5 块', () => {
    assert.deepEqual(sessionBlockIndices(1, 11, blocks), [0, 1, 2, 3, 4]);
  });
  it('单节 5 在第3块', () => {
    assert.deepEqual(sessionBlockIndices(5, 5, blocks), [2]);
  });
});

describe('colorForCourse', () => {
  it('同名课返回相同颜色', () => {
    const c1 = colorForCourse('经济法');
    const c2 = colorForCourse('经济法');
    assert.equal(c1, c2);
  });
  it('颜色在调色板内', () => {
    const c = colorForCourse('随机课程名');
    assert.ok(COURSE_COLORS.includes(c));
  });
  it('不同课名大概率不同色', () => {
    const c1 = colorForCourse('课程A');
    const c2 = colorForCourse('课程B');
    // 不保证不同色（哈希碰撞），但至少都是合法颜色
    assert.ok(COURSE_COLORS.includes(c1));
    assert.ok(COURSE_COLORS.includes(c2));
  });
});

describe('getWeekInfo', () => {
  it('返回 weekNum 和 isOddWeek', () => {
    const r = getWeekInfo('2025-03-03', '2025-03-03');
    assert.equal(r.weekNum, 1);
    assert.equal(r.isOddWeek, true);
  });
  it('第2周为双周', () => {
    const r = getWeekInfo('2025-03-03', '2025-03-10');
    assert.equal(r.weekNum, 2);
    assert.equal(r.isOddWeek, false);
  });
});

describe('getSessionsForDay', () => {
  it('返回指定星期和周的课节', () => {
    const sem = {
      sessions: [
        { id: 's1', weekday: 0, weeks: [[1, 16]], isOddEven: 'all' },
        { id: 's2', weekday: 1, weeks: [[1, 16]], isOddEven: 'all' },
        { id: 's3', weekday: 0, weeks: [[2, 5]], isOddEven: 'all' },
      ],
    };
    const r = getSessionsForDay(sem, 0, 1, true);
    assert.equal(r.length, 1);
    assert.equal(r[0].id, 's1');
  });
  it('无课节返回空数组', () => {
    const sem = { sessions: [] };
    assert.deepEqual(getSessionsForDay(sem, 0, 1, true), []);
  });
  it('null 学期返回空数组', () => {
    assert.deepEqual(getSessionsForDay(null, 0, 1, true), []);
  });
});

describe('getActiveSemester', () => {
  it('返回活跃学期', () => {
    const schedule = {
      activeSemesterId: 's1',
      semesters: { s1: { id: 's1', name: 'test' } },
    };
    assert.equal(getActiveSemester(schedule).name, 'test');
  });
  it('无活跃 ID 返回 null', () => {
    assert.equal(getActiveSemester({ activeSemesterId: '', semesters: {} }), null);
  });
  it('活跃 ID 不存在返回 null', () => {
    assert.equal(getActiveSemester({ activeSemesterId: 'nonexistent', semesters: {} }), null);
  });
});

describe('newSessionId / newSemesterId', () => {
  it('生成 session ID', () => {
    const id = newSessionId();
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 1);
  });
  it('生成 semester ID', () => {
    const id = newSemesterId();
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 1);
  });
  it('session ID 以 s 开头', () => {
    assert.match(newSessionId(), /^s\d+/);
  });
  it('semester ID 以 sem 开头', () => {
    assert.match(newSemesterId(), /^sem\d+/);
  });
  it('连续调用产生不同 ID', () => {
    const a = newSessionId();
    const b = newSessionId();
    assert.notEqual(a, b);
  });
});
