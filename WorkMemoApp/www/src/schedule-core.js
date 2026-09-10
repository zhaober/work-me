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

/** 基于课程名哈希生成调色板下标（同名课下标一致，0 ~ COURSE_COLORS.length-1）
 * 原生小组件拿不到十六进制色值去动态设圆角色块背景，改为传下标，
 * 由 Java 侧映射到预置的圆角 drawable（wc_bg_<index>）。 */
export function colorIndexOfCourse(courseName) {
  var name = String(courseName == null ? '' : courseName);
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % COURSE_COLORS.length;
}

/** 基于课程名哈希生成颜色（同名课颜色一致） */
export function colorForCourse(courseName) {
  return COURSE_COLORS[colorIndexOfCourse(courseName)];
}

/** 找到某节次所属的节次块下标（找不到返回 -1） */
export function blockIndexForPeriod(period, blocks) {
  var list = (Array.isArray(blocks) && blocks.length) ? blocks : DEFAULT_PERIOD_BLOCKS;
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (period >= b.periodStart && period <= b.periodEnd) return i;
  }
  return -1;
}

/** 取出节次块时间标签的起始时间："08:00-09:40" → "08:00" */
export function blockStartTime(block) {
  if (!block) return '';
  var parts = String(block.timeLabel || '').split(/[-\u2013\u2014]/);
  return (parts[0] || '').trim();
}

/** 根据学期开始日期计算当前周信息 */
export function getWeekInfo(startDate, today) {
  var weekNum = getCurrentWeek(startDate, today);
  return { weekNum: weekNum, isOddWeek: weekNum % 2 === 1 };
}

/** WakeUp 风格表头：本周(或偏移周)周一~周日的"几号"数字。
 * todayIso: YYYY-MM-DD；todayDow: 0=周一；weekDelta: 相对本周偏移量 */
export function weekdayDateNums(todayIso, todayDow, weekDelta) {
  var base = new Date(todayIso + 'T00:00:00');
  var monday = new Date(base);
  monday.setDate(base.getDate() - todayDow + weekDelta * 7);
  var out = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d.getDate());
  }
  return out;
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

/** 桌面小组件数据：今日课程 + 近日(今天起3天)课程。
 * 返回可 JSON 序列化的 payload，供原生 AppWidget 渲染。 */
export function buildWidgetPayload(schedule, todayIso, maxPerDay) {
  maxPerDay = maxPerDay || 3;
  var semester = getActiveSemester(schedule);
  if (!semester) {
    return { date: todayIso, hasSemester: false, weekNum: 0, dowName: '', semesterName: '',
      today: { courses: [], total: 0 }, recent: [] };
  }
  var blocks = schedule.periodBlocks || DEFAULT_PERIOD_BLOCKS;
  var wi = getWeekInfo(semester.startDate || '', todayIso);
  var d = new Date(todayIso + 'T00:00:00');
  var todayDow = (d.getDay() + 6) % 7; // 0=周一
  function timeAt(period, which) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (period >= b.periodStart && period <= b.periodEnd) {
        var parts = String(b.timeLabel || '').split(/[-\u2013]/);
        return (which === 'end' ? parts[1] : parts[0]) || '';
      }
    }
    return '';
  }
  function dayList(dow) {
    var sessions = getSessionsForDay(semester, dow, wi.weekNum, wi.isOddWeek) || [];
    sessions = sessions.slice().sort(function(a, b) { return a.periodStart - b.periodStart; });
    return sessions.map(function(s) {
      return { name: s.courseName, room: s.classroom || '', start: timeAt(s.periodStart, 'start'), end: timeAt(s.periodEnd, 'end'), colorIndex: colorIndexOfCourse(s.courseName) };
    });
  }
  var todayCourses = dayList(todayDow);
  var recent = [];
  for (var off = 0; off < 3; off++) {
    var nd = new Date(d); nd.setDate(d.getDate() + off);
    var iso = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0') + '-' + String(nd.getDate()).padStart(2, '0');
    var cs = dayList((todayDow + off) % 7);
    recent.push({ date: iso, dow: (todayDow + off) % 7, courses: cs.slice(0, maxPerDay), total: cs.length });
  }
  return {
    date: todayIso, hasSemester: true, weekNum: wi.weekNum,
    dowName: WEEKDAY_NAMES[todayDow], semesterName: semester.name || '',
    today: { courses: todayCourses.slice(0, maxPerDay), total: todayCourses.length },
    recent: recent
  };
}

/** 桌面小组件数据：整周课表网格（仿参考图 —— 深色卡 + 星期表头 + 左侧时间列 + 彩色课程块）。
 * 原生 RemoteViews 不支持跨行合并单元格，因此一个格子 = 一个节次块 × 一天，
 * 课程画在"起始节次所属的块"上，跨块课程用 periodLabel 标出真实节次。
 * @param {object} schedule 全量课表
 * @param {string} todayIso 'YYYY-MM-DD'
 * @param {{maxRows?:number}} [opts] maxRows 默认 5（与默认 5 个节次块对齐） */
export function buildWidgetGridPayload(schedule, todayIso, opts) {
  opts = opts || {};
  var maxRows = opts.maxRows || 5;
  var blocks = (schedule && Array.isArray(schedule.periodBlocks) && schedule.periodBlocks.length)
    ? schedule.periodBlocks : DEFAULT_PERIOD_BLOCKS;

  var base = new Date((todayIso || '') + 'T00:00:00');
  if (isNaN(base.getTime())) {
    var now = new Date();
    base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  var iso = base.getFullYear() + '-' + String(base.getMonth() + 1).padStart(2, '0')
    + '-' + String(base.getDate()).padStart(2, '0');
  var todayDow = (base.getDay() + 6) % 7; // 0=周一
  var nums = weekdayDateNums(iso, todayDow, 0);
  var weekdays = WEEKDAY_NAMES.map(function(n, i) {
    return { label: n.slice(1), dateNum: nums[i], isToday: i === todayDow };
  });

  var semester = getActiveSemester(schedule);
  var hasSemester = !!(semester && semester.startDate);
  var wi = hasSemester ? getWeekInfo(semester.startDate, iso) : { weekNum: 0, isOddWeek: true };
  var rows = [];

  if (semester) {
    // 每个星期先算出本周生效的课节（按起始节次升序），再统一挑选要显示的节次块
    var dayCache = [];
    var used = {};
    for (var dow = 0; dow < 7; dow++) {
      var list = getSessionsForDay(semester, dow, wi.weekNum, wi.isOddWeek).slice()
        .sort(function(a, b) { return a.periodStart - b.periodStart; });
      dayCache.push(list);
      for (var k = 0; k < list.length; k++) {
        var bi0 = blockIndexForPeriod(list[k].periodStart, blocks);
        if (bi0 >= 0) used[bi0] = true;
      }
    }
    // 只显示"本周确实有课"的节次块；整周无课时退回前 maxRows 个块，保持网格形态
    var rowBlocks = Object.keys(used).map(Number).sort(function(a, b) { return a - b; });
    if (!rowBlocks.length) rowBlocks = blocks.map(function(_, i) { return i; });
    rowBlocks = rowBlocks.slice(0, maxRows);

    rows = rowBlocks.map(function(bi) {
      var b = blocks[bi] || {};
      var cells = [];
      for (var d = 0; d < 7; d++) {
        var hit = null;
        var day = dayCache[d];
        for (var j = 0; j < day.length; j++) {
          if (blockIndexForPeriod(day[j].periodStart, blocks) === bi) { hit = day[j]; break; }
        }
        cells.push(hit ? {
          name: hit.courseName || '',
          room: hit.classroom || '',
          colorIndex: colorIndexOfCourse(hit.courseName),
          periodLabel: hit.periodStart === hit.periodEnd
            ? hit.periodStart + '节'
            : hit.periodStart + '-' + hit.periodEnd + '节'
        } : null);
      }
      return { blockIndex: bi, time: blockStartTime(b), label: b.label || '', cells: cells };
    });
  }

  return {
    hasSemester: hasSemester,
    weekNum: wi.weekNum,
    weekLabel: hasSemester ? '第' + wi.weekNum + '周' : '',
    dateLabel: iso.replace(/-/g, '.'),
    dowName: WEEKDAY_NAMES[todayDow],
    weekdays: weekdays,
    rowCount: rows.length,
    rows: rows
  };
}

/** 生成新课节 ID */
export function newSessionId() {
  return 's' + Date.now() + Math.floor(Math.random() * 1000);
}

/** 生成新学期 ID */
export function newSemesterId() {
  return 'sem' + Date.now() + Math.floor(Math.random() * 1000);
}

/** Excel 导入：从表头行中挑选"上课地点"列。
 * 教务导出的表常有「教室类别」（多媒体/机房等类型列），不能当成地点。
 * 优先级：上课地点 > 地点 > 教室（排除"教室类别/教室类型"）。 */
export function pickRoomColumn(headers) {
  var exact = -1, diDian = -1, jiaoShi = -1;
  headers.forEach(function(h, i) {
    var s = String(h || '');
    if (/上课地点/.test(s)) { if (exact < 0) exact = i; }
    else if (/地点/.test(s)) { if (diDian < 0) diDian = i; }
    else if (/教室/.test(s) && !/类别|类型/.test(s)) { if (jiaoShi < 0) jiaoShi = i; }
  });
  if (exact >= 0) return exact;
  if (diDian >= 0) return diDian;
  return jiaoShi;
}
