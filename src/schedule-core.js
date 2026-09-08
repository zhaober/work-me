/**
 * 工作计划与复盘备忘录 App - 课表核心逻辑（纯函数）
 *
 * 数据模型：
 *   DB.courseSchedule = {
 *     semesters: { [id]: { id, name, startDate, totalWeeks, sessions: [] } },
 *     activeSemesterId: string,
 *     periodBlocks: [{ id, label, timeLabel, periodStart, periodEnd }]
 *   }
 *   session = { id, courseName, teacher, weekday(0-6), periodStart, periodEnd,
 *               classroom, color, weeks:[[start,end],...], isOddEven:'all|odd|even', notes }
 */

/** 默认节次块配置（5 个块，对应大学常见作息） */
export const DEFAULT_PERIOD_BLOCKS = [
  { id: 0, label: '第1-2节', timeLabel: '08:00-09:40', periodStart: 1, periodEnd: 2 },
  { id: 1, label: '第3-4节', timeLabel: '10:00-11:40', periodStart: 3, periodEnd: 4 },
  { id: 2, label: '第5-6节', timeLabel: '14:00-15:40', periodStart: 5, periodEnd: 6 },
  { id: 3, label: '第7-8节', timeLabel: '16:00-17:40', periodStart: 7, periodEnd: 8 },
  { id: 4, label: '第9-11节', timeLabel: '19:00-21:40', periodStart: 9, periodEnd: 11 },
];

/** 星期映射：0=周一, 6=周日 */
export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 课程颜色调色板（10 色，循环使用） */
export const COURSE_COLORS = [
  '#4F6EF7', '#FF8A3D', '#2BB673', '#E94560', '#9B59B6',
  '#1ABC9C', '#F39C12', '#3498DB', '#E74C3C', '#16A085',
];

/** 默认课表数据 */
export function getDefaultSchedule() {
  return {
    semesters: {},
    activeSemesterId: '',
    periodBlocks: DEFAULT_PERIOD_BLOCKS,
  };
}

/** 规范化课表数据 */
export function normalizeSchedule(input) {
  var d = getDefaultSchedule();
  if (!input || typeof input !== 'object') return d;
  return {
    semesters: (input.semesters && typeof input.semesters === 'object') ? input.semesters : {},
    activeSemesterId: input.activeSemesterId || '',
    periodBlocks: (Array.isArray(input.periodBlocks) && input.periodBlocks.length) ? input.periodBlocks : DEFAULT_PERIOD_BLOCKS,
  };
}

/**
 * 计算当前是第几周（基于学期开始日期）
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} [today]   'YYYY-MM-DD'，默认当前日期
 * @returns {number} 周数（从 1 开始；未开学返回 0）
 */
export function getCurrentWeek(startDate, today) {
  if (!startDate) return 1;
  var sd = new Date(startDate);
  if (isNaN(sd.getTime())) return 1;
  var td = today ? new Date(today) : new Date();
  if (isNaN(td.getTime())) td = new Date();
  var diff = (td.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 0;
  return Math.floor(diff / 7) + 1;
}

/**
 * 检查课节是否在指定周生效
 * @param {object} session 课节对象
 * @param {number} weekNum 当前周数
 * @param {boolean} isOddWeek 当前是否为单周
 */
export function isSessionActiveInWeek(session, weekNum, isOddWeek) {
  if (!session) return false;
  // 无周次限制 → 始终生效
  if (!session.weeks || !session.weeks.length) return true;
  // 检查周次范围
  var weekMatch = session.weeks.some(function(range) {
    return weekNum >= range[0] && weekNum <= range[1];
  });
  if (!weekMatch) return false;
  // 检查单双周
  if (session.isOddEven === 'odd') return !!isOddWeek;
  if (session.isOddEven === 'even') return !isOddWeek;
  return true;
}

/**
 * 解析 Excel「上课时间」字段
 * 格式示例: "星期一 上午 1-2节", "星期二 晚上 9-11节", "星期三 白天 1-8节"
 * @returns {{weekday:number, periodStart:number, periodEnd:number}|null}
 */
export function parseTimeField(text) {
  if (!text || typeof text !== 'string') return null;
  var m = text.match(/星期([一二三四五六日])/);
  if (!m) return null;
  var weekdayMap = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6 };
  var weekday = weekdayMap[m[1]];
  // 范围: "1-2节"
  var rm = text.match(/(\d+)\s*[-–—~]\s*(\d+)\s*节/);
  if (rm) {
    return { weekday: weekday, periodStart: parseInt(rm[1], 10), periodEnd: parseInt(rm[2], 10) };
  }
  // 单节: "3节"
  var sm = text.match(/(\d+)\s*节/);
  if (sm) {
    return { weekday: weekday, periodStart: parseInt(sm[1], 10), periodEnd: parseInt(sm[1], 10) };
  }
  return { weekday: weekday, periodStart: 1, periodEnd: 1 };
}

/**
 * 解析 Excel「上课周」字段
 * 格式示例: "2-5,7-9,11-17", "17", "1,6,8,10"
 * @returns {Array<[number,number]>} 周次范围数组
 */
export function parseWeekField(text) {
  if (!text || typeof text !== 'string') return [];
  var trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/[,，、]/).map(function(s) {
    s = s.trim();
    if (!s) return null;
    var rm = s.match(/^(\d+)\s*[-–—~]\s*(\d+)$/);
    if (rm) return [parseInt(rm[1], 10), parseInt(rm[2], 10)];
    var sm = s.match(/^(\d+)$/);
    if (sm) return [parseInt(sm[1], 10), parseInt(sm[1], 10)];
    return null;
  }).filter(function(r) { return r; });
}

/**
 * 解析 Excel「任课老师」字段
 * 格式示例: "4724.徐媛", "6226.马超、6181.李子琳"
 * @returns {string} 教师名（去编号前缀）
 */
export function parseTeacherField(text) {
  if (!text || typeof text !== 'string') return '';
  // 多人: "6226.马超、6181.李子琳、5874.曹欢" → "马超、李子琳、曹欢"
  if (/[、,，]/.test(text)) {
    return text.split(/[、,，]/).map(function(part) {
      var m = part.match(/\d+\.(.+)$/);
      return m ? m[1].trim() : part.trim();
    }).filter(Boolean).join('、');
  }
  // 单人: "4724.徐媛" → "徐媛"
  var m = text.match(/\d+\.(.+)$/);
  return m ? m[1].trim() : text.trim();
}

/**
 * 计算课节跨越的节次块索引
 * @param {number} periodStart
 * @param {number} periodEnd
 * @param {Array} blocks 节次块配置
 * @returns {number[]} 块索引数组
 */
export function sessionBlockIndices(periodStart, periodEnd, blocks) {
  var indices = [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (periodStart <= b.periodEnd && periodEnd >= b.periodStart) {
      indices.push(i);
    }
  }
  return indices;
}

/** 基于课程名哈希生成颜色（同名课颜色一致） */
export function colorForCourse(courseName) {
  var hash = 0;
  for (var i = 0; i < courseName.length; i++) {
    hash = ((hash << 5) - hash) + courseName.charCodeAt(i);
    hash = hash & hash;
  }
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

/** 根据学期开始日期计算当前周信息 */
export function getWeekInfo(startDate, today) {
  var weekNum = getCurrentWeek(startDate, today);
  return { weekNum: weekNum, isOddWeek: weekNum % 2 === 1 };
}

/** 获取指定星期几和周的课节列表（仅返回该周生效的课节） */
export function getSessionsForDay(semester, weekday, weekNum, isOddWeek) {
  if (!semester || !Array.isArray(semester.sessions)) return [];
  return semester.sessions.filter(function(s) {
    return s.weekday === weekday && isSessionActiveInWeek(s, weekNum, isOddWeek);
  });
}

/** 获取活跃学期 */
export function getActiveSemester(schedule) {
  if (!schedule || !schedule.activeSemesterId) return null;
  return schedule.semesters[schedule.activeSemesterId] || null;
}

/** 生成新课节 ID */
export function newSessionId() {
  return 's' + Date.now() + Math.floor(Math.random() * 1000);
}

/** 生成新学期 ID */
export function newSemesterId() {
  return 'sem' + Date.now() + Math.floor(Math.random() * 1000);
}
