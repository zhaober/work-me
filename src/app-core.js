/**
 * 工作计划与复盘备忘录 App - 核心工具函数（纯逻辑，可测试）
 */

/** 返回今天的日期字符串 YYYY-MM-DD（基于本地时间） */
export function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 将 YYYY-MM-DD 格式化为 "周四 · 8月27日" 形式 */
export function formatDateHeader(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${weekdays[d.getDay()]} · ${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
}

/** 解析 YYYY-MM-DD 为 Date 对象（避免时区问题） */
export function parseDate(dateStr) {
  const parts = dateStr.split('-');
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** 获取问候语：根据当前小时返回早/中/晚 */
export function getGreetingByHour(hour) {
  if (hour < 6) return { text: '夜深了，注意休息', period: 'night' };
  if (hour < 12) return { text: '早上好，今天也要高效', period: 'morning' };
  if (hour < 14) return { text: '中午好，保持专注', period: 'noon' };
  if (hour < 19) return { text: '下午好，继续加油', period: 'afternoon' };
  return { text: '晚上好，回顾今天', period: 'evening' };
}

/** 名人名言库（含中文原文与英文对照） */
export const QUOTES = [
  { text: '种一棵树最好的时间是十年前，其次是现在。', author: 'Dambisa Moyo', en: 'The best time to plant a tree was 10 years ago. The second best time is now.' },
  { text: '知行合一。', author: '王阳明', en: 'Knowledge is action, and action is knowledge.' },
  { text: '不积跬步，无以至千里。', author: '荀子', en: 'Without accumulating small steps, one cannot reach a thousand miles.' },
  { text: 'Stay hungry, stay foolish.', author: 'Steve Jobs', en: 'Stay hungry, stay foolish.' },
  { text: '千里之行，始于足下。', author: '老子', en: 'A journey of a thousand miles begins with a single step.' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs', en: 'The only way to do great work is to love what you do.' },
  { text: '业精于勤，荒于嬉。', author: '韩愈', en: 'Excellence in work is due to diligence; failure comes from negligence.' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela', en: 'It always seems impossible until it is done.' },
  { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原', en: 'The road is long and winding; I will seek far and wide.' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt', en: 'Do what you can, with what you have, where you are.' },
  { text: '天行健，君子以自强不息。', author: '《周易》', en: 'As Heaven keeps moving vigorously, a gentleman should strive unceasingly.' },
  { text: 'Your time is limited, so don’t waste it living someone else’s life.', author: 'Steve Jobs', en: 'Your time is limited, so don’t waste it living someone else’s life.' }
];

/** 根据日期字符串选择当日名言（同一天返回同一则） */
export function getDailyQuote(dateStr) {
  const idx = dateStr.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % QUOTES.length;
  return { ...QUOTES[idx], index: idx };
}

/** 删除清单数组中指定下标的项（返回新数组） */
export function deleteChecklistItem(items, index) {
  return items.filter((_, i) => i !== index);
}

/** 判断一条记录是否含有可预览的图片（data URL 字符串） */
export function hasImage(data) {
  return !!(data && typeof data.image === 'string' && data.image.length > 0);
}

/** 构建某文件夹下的可选内容列表（子文件夹 + 记录） */
export function buildFolderContents(folderId, folders, records) {
  const subs = Object.keys(folders)
    .filter(k => folders[k].parent === folderId)
    .map(k => ({ id: k, type: 'folder', name: folders[k].name }));
  const recs = Object.keys(records)
    .filter(k => records[k].folderId === folderId)
    .map(k => ({ id: k, type: 'record', title: records[k].title }));
  return [...subs, ...recs];
}

/** 递归收集某文件夹及其所有后代文件夹的 id */
export function collectDescendantFolderIds(folderId, folders) {
  const ids = new Set();
  function walk(id) {
    ids.add(id);
    Object.keys(folders).filter(k => folders[k].parent === id).forEach(k => walk(k));
  }
  walk(folderId);
  return [...ids];
}

/** 根据选中的 id 集合返回新的 folders 与 records（被选中文件夹会递归删除） */
export function deleteSelectedItems(selectedIds, folders, records) {
  const nextFolders = { ...folders };
  const nextRecords = { ...records };
  const set = new Set(selectedIds);
  set.forEach(id => {
    if (nextFolders[id]) {
      collectDescendantFolderIds(id, nextFolders).forEach(did => {
        delete nextFolders[did];
        Object.keys(nextRecords).filter(k => nextRecords[k].folderId === did).forEach(k => delete nextRecords[k]);
      });
    } else if (nextRecords[id]) {
      delete nextRecords[id];
    }
  });
  return { folders: nextFolders, records: nextRecords };
}

/** 清空文件夹内容：删除其下所有子文件夹（递归）与记录，保留文件夹本身 */
export function clearFolderContents(folderId, folders, records) {
  const nextFolders = { ...folders };
  const nextRecords = { ...records };
  Object.keys(nextFolders).filter(k => nextFolders[k].parent === folderId).forEach(k => {
    collectDescendantFolderIds(k, nextFolders).forEach(did => {
      delete nextFolders[did];
      Object.keys(nextRecords).filter(rk => nextRecords[rk].folderId === did).forEach(rk => delete nextRecords[rk]);
    });
  });
  Object.keys(nextRecords).filter(k => nextRecords[k].folderId === folderId).forEach(k => delete nextRecords[k]);
  return { folders: nextFolders, records: nextRecords };
}

/* ============ 农历 / 二十四节气 / 节日 ============ */
// 1900-2100 农历闰大小信息表（每年一个 20-bit 编码，源自香港天文台数据）
const LUNAR_INFO = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,0x0d520];

const SOLAR_TERM_NAMES = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
const TERM_BASE = [0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];
const GREGORIAN_FESTIVALS = {'1-1':'元旦','2-14':'情人节','3-8':'妇女节','3-12':'植树节','4-1':'愚人节','5-1':'劳动节','5-4':'青年节','6-1':'儿童节','7-1':'建党节','8-1':'建军节','9-10':'教师节','10-1':'国庆节','12-24':'平安夜','12-25':'圣诞节'};
// 农历固定节日（month-day -> 名称）；闰月不重复
const LUNAR_FESTIVALS = [[1,1,'春节'],[1,15,'元宵'],[2,2,'龙抬头'],[5,5,'端午'],[7,7,'七夕'],[7,15,'中元'],[8,15,'中秋'],[9,9,'重阳'],[12,8,'腊八'],[12,23,'小年']];

function lYearDays(y){ let sum=348; for(let i=0x8000;i>0x8;i>>=1){ sum += (LUNAR_INFO[y-1900] & i)?1:0; } return sum + leapDays(y); }
function leapDays(y){ if(leapMonth(y)){ return (LUNAR_INFO[y-1900] & 0x10000)?30:29; } return 0; }
function leapMonth(y){ return LUNAR_INFO[y-1900] & 0xf; }
function monthDays(y,m){ if(m>12||m<1) return -1; return (LUNAR_INFO[y-1900] & (0x10000>>m))?30:29; }

/** 阳历转农历，返回 { year, month, day, isLeap } */
export function getLunar(y, m, d){
  const baseDate = Date.UTC(1900,0,31);
  const objDate = Date.UTC(y, m-1, d);
  let offset = Math.round((objDate - baseDate) / 86400000);
  let temp=0, lunarYear=1900;
  for(lunarYear=1900; lunarYear<2101 && offset>0; lunarYear++){ temp=lYearDays(lunarYear); offset-=temp; }
  if(offset<0){ offset+=temp; lunarYear--; }
  let isLeap=false;
  const leap=leapMonth(lunarYear);
  let lunarMonth;
  for(lunarMonth=1; lunarMonth<13 && offset>0; lunarMonth++){
    if(leap>0 && lunarMonth===(leap+1) && !isLeap){ temp=leapDays(lunarYear); offset-=temp; if(offset<=0){ isLeap=true; lunarMonth--; break; } }
    temp=monthDays(lunarYear, lunarMonth); offset-=temp;
  }
  if(offset===0 && leap>0 && lunarMonth===leap+1){ if(isLeap){ isLeap=false; } else { isLeap=true; lunarMonth--; } }
  if(offset<0){ offset+=temp; lunarMonth--; }
  return { year:lunarYear, month:lunarMonth, day:offset+1, isLeap:isLeap };
}

/** 返回该阳历日期的节气名称；无则返回 null */
export function getSolarTerm(y,m,d){
  for(let n=0;n<24;n++){
    const dt = new Date((31556925974.7*(y-1900) + TERM_BASE[n]*60000) + Date.UTC(1900,0,6,2,5));
    if(dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d) return SOLAR_TERM_NAMES[n];
  }
  return null;
}

/** 返回该阳历日期的所有节日名称数组（公历 + 农历） */
export function getFestival(y,m,d){
  const names=[];
  const g=GREGORIAN_FESTIVALS[m+'-'+d];
  if(g) names.push(g);
  const ln=getLunar(y,m,d);
  if(!ln.isLeap){
    for(let i=0;i<LUNAR_FESTIVALS.length;i++){ const f=LUNAR_FESTIVALS[i]; if(f[0]===ln.month && f[1]===ln.day) names.push(f[2]); }
  }
  return names;
}

/** 匹配自定义重要日子（按 month/day 周年重复） */
export function matchCustomEvents(events, month, day){
  return (events||[]).filter(e => e.month===month && e.day===day);
}

/** 汇总某天的标记：节气 / 节日 / 自定义重要日子 */
export function getDayMarks(y,m,d,events){
  const terms=[]; const t=getSolarTerm(y,m,d); if(t) terms.push(t);
  const festivals=getFestival(y,m,d);
  const customs=matchCustomEvents(events, m, d).map(e => ({ id:e.id, name:e.name }));
  return { terms, festivals, customs };
}

/* ============ 优先级 ============ */
export const PRIORITY_META = {
  0: { label: '无', color: '#9AA0AB' },
  1: { label: '高', color: '#FF4D4F' },
  2: { label: '中', color: '#FF8A3D' },
  3: { label: '低', color: '#2BB673' }
};

/** 获取优先级元数据，非法值回退到 0 */
export function getPriorityMeta(level) {
  return PRIORITY_META[level] || PRIORITY_META[0];
}

/** 按优先级降序排序记录（高 -> 低 -> 无），返回新数组 */
export function sortByPriority(records) {
  return [...records].sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/** 从记录对象中提取指定文件夹及其后代中优先级 > 0 的记录，并按优先级排序 */
export function collectPrioritizedRecords(folderId, folders, records) {
  const ids = collectDescendantFolderIds(folderId, folders);
  return sortByPriority(
    Object.keys(records)
      .filter(k => ids.includes(records[k].folderId) && (records[k].priority || 0) > 0)
      .map(k => ({ id: k, ...records[k] }))
  );
}

/* ============ 主题 TOKENS ============ */
export const THEME_TOKENS = {
  light: {
    '--bg':'#F4F5FA', '--card':'#FFFFFF', '--border':'#ECECF1',
    '--text':'#1A1D29', '--text-2':'#70747E', '--text-3':'#A0A4AE',
    '--accent':'#4F6EF7', '--accent-soft':'#EEF1FE', '--accent-stroke':'#C9D2FB',
    '--orange':'#FF8A3D', '--orange-soft':'#FFF1E6', '--orange-card':'#FFF8F2', '--orange-border':'#FBCDA8',
    '--progress-track':'#F0E2D6', '--check-off':'#C9CDD6', '--body':'#2A2D36', '--danger':'#E53935'
  },
  dark: {
    '--bg':'#0E1014', '--card':'#1A1D24', '--border':'#2A2E37',
    '--text':'#EDEFF4', '--text-2':'#9AA0AC', '--text-3':'#6B7180',
    '--accent':'#6E8BFF', '--accent-soft':'#1E2540', '--accent-stroke':'#33407A',
    '--orange':'#FF9A55', '--orange-soft':'#3A2A1E', '--orange-card':'#2A2018', '--orange-border':'#5A3E2A',
    '--progress-track':'#2E2620', '--check-off':'#4A4F5A', '--body':'#C8CDD6', '--danger':'#FF5B56'
  }
};
/** 规范化主题名，仅 'dark' 合法，其余回退 'light' */
export function normalizeTheme(t){ return t === 'dark' ? 'dark' : 'light'; }
/** 返回某主题的 CSS 变量对象（用于测试与运行时注入） */
export function getThemeVars(theme){ return THEME_TOKENS[normalizeTheme(theme)]; }

/* ============ UI 风格 TOKENS ============ */
export const STYLE_LIST = ['classic', 'glass', 'minimal', 'depth'];
export const STYLE_LABELS = { classic:'经典', glass:'液态玻璃', minimal:'极简', depth:'景深' };
export const STYLE_TOKENS = {
  classic: { label:'经典',    surface:'solid', blur:0,  elevation:'none'  },
  glass:   { label:'液态玻璃', surface:'glass', blur:18, elevation:'soft'  },
  minimal: { label:'极简',    surface:'flat', blur:0,  elevation:'none'  },
  depth:   { label:'景深',    surface:'solid', blur:0,  elevation:'strong'},
};
/** 规范化风格名，仅 STYLE_LIST 内合法，其余回退 'classic' */
export function normalizeStyle(s){ return STYLE_LIST.indexOf(s) >= 0 ? s : 'classic'; }
export function getStyleLabel(s){ return STYLE_LABELS[normalizeStyle(s)] || '经典'; }
/** 返回某风格的视觉元数据（用于测试与运行时参考） */
export function getStyleTokens(style){ return STYLE_TOKENS[normalizeStyle(style)]; }

/* ============ 用户设置（个性化）默认与规范化 ============ */
/** 设置默认值：浅色主题、开启音效、经典风格、无背景 */
export function getDefaultSettings(){ return { theme:'light', soundOn:true, style:'classic', bgImage:null }; }
/** 规范化用户设置：缺失/非法字段回落默认值，不影响已合法字段；输入非对象时返回默认 */
export function normalizeSettings(input){
  const d = getDefaultSettings();
  if(!input || typeof input !== 'object') return d;
  return {
    theme:   normalizeTheme(input.theme) || 'light',
    soundOn: input.soundOn !== false,
    style:   normalizeStyle(input.style),
    bgImage: input.bgImage ? input.bgImage : null,
  };
}

/* ============ 导出文件 ============ */
/** 清理文件名中的非法字符（Windows / Android 通用保留字符），并压缩多余空白 */
export function sanitizeFileName(name){
  return String(name == null ? '' : name)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 构建导出文件名：<base>-<YYYY-MM-DD>.<ext>
 * base / ext 会做非法字符清理；dateStr 非 YYYY-MM-DD 时省略日期段；base 为空回退「导出」
 */
export function buildExportFilename(base, dateStr, ext){
  var b = sanitizeFileName(base) || '导出';
  var d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : '';
  var e = sanitizeFileName(ext || 'json').replace(/^\.+/, '') || 'json';
  return d ? (b + '-' + d + '.' + e) : (b + '.' + e);
}

/** 未指定自定义目录时，各平台默认落地位置文案 */
export const DEFAULT_DOWNLOAD_HINT = '系统「下载」目录';

/**
 * 规范化导出目录：去首尾空白、去尾部斜杠；空值/空白串返回 null（表示使用系统默认下载目录）
 */
export function normalizeExportDir(input){
  if(input == null) return null;
  var s = String(input).trim().replace(/[\\/]+$/, '');
  return s.length ? s : null;
}

/** 判断运行环境是否支持选择文件夹（File System Access API） */
export function supportsDirectoryPicker(globalObj){
  return !!(globalObj && typeof globalObj.showDirectoryPicker === 'function');
}

/**
 * 汇总导出目标：文件名 + 目录 -> 完整路径
 * dir 为空时 path 仅为文件名（走系统默认下载目录）
 */
export function buildExportTarget(fileName, dir){
  var d = normalizeExportDir(dir);
  return {
    fileName: fileName,
    dir: d,
    isCustom: !!d,
    path: d ? (d + '/' + fileName) : fileName
  };
}

/**
 * 描述导出文件的落地位置，用于明确告知用户文件存到了哪里。
 * @param {string} fileName 导出文件名
 * @param {string|null} customDir 用户自定义目录（绝对/相对路径均可）；为 null 表示使用系统默认下载目录
 * @returns {{hasCustomDir:boolean, path:string|null, message:string}}
 */
export function describeExportLocation(fileName, customDir){
  var name = fileName || '导出文件';
  var dir = normalizeExportDir(customDir);
  if(dir){
    return {
      hasCustomDir: true,
      path: dir + '/' + name,
      message: '文件已保存到：\n' + dir + '/' + name
    };
  }
  return {
    hasCustomDir: false,
    path: null,
    message: '文件已保存到' + DEFAULT_DOWNLOAD_HINT + '\n文件名：' + name + '\n\n· 手机：文件管理 → 下载\n· 电脑：浏览器默认下载文件夹'
  };
}

/* ============ 滚轮选择器（滚盘） ============ */
/** 闰年判断；非数字返回 false */
export function isLeapYear(year){
  // null/undefined/'' 会被 Number() 转成 0，而公元 0 年恰好是闰年，须先拦截
  if(year === null || year === undefined || year === '') return false;
  var y = Number(year);
  if(!isFinite(y)) return false;
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** 某年某月的天数；月份非法返回 0 */
export function daysInMonth(year, month){
  if(year === null || year === undefined || year === '') return 0;
  if(month === null || month === undefined || month === '') return 0;
  var y = Number(year), m = Number(month);
  if(!isFinite(y) || !isFinite(m) || m < 1 || m > 12) return 0;
  var table = [31,28,31,30,31,30,31,31,30,31,30,31];
  if(m === 2 && isLeapYear(y)) return 29;
  return table[m - 1];
}

function range(from, to){ var a=[]; for(var i=from;i<=to;i++) a.push(i); return a; }

/**
 * 构建日期滚轮的三列选项（年 / 月 / 日）
 * @param {number} year 当前年
 * @param {number} month 当前月 1-12
 * @param {{yearRange?:number}} opts yearRange 为年的前后跨度，默认 10
 */
export function buildDateWheelOptions(year, month, opts){
  var o = opts || {};
  var span = Number(o.yearRange) > 0 ? Number(o.yearRange) : 10;
  var y = Number(year), m = Number(month);
  if(!isFinite(y)) y = 1970;
  if(!isFinite(m) || m < 1 || m > 12) m = 1;
  var days = daysInMonth(y, m) || 31;
  return { years: range(y - span, y + span), months: range(1, 12), days: range(1, days) };
}

/** 构建时间滚轮的两列选项（时 0-23 / 分按 step 步长） */
export function buildTimeWheelOptions(step){
  var s = Number(step) > 0 ? Math.floor(Number(step)) : 1;
  if(s > 60) s = 60;
  var minutes = [];
  for(var i = 0; i < 60; i += s) minutes.push(i);
  return { hours: range(0, 23), minutes: minutes };
}

/** 把日夹到当月有效范围（切换年/月后防止出现 2 月 31 日） */
export function clampDay(year, month, day){
  var max = daysInMonth(year, month);
  if(!max) return 1;
  var d = Number(day);
  if(!isFinite(d)) return 1;
  if(d < 1) return 1;
  if(d > max) return max;
  return d;
}

/** 按索引取滚轮值，索引越界夹到首尾 */
export function wheelValue(options, index){
  var arr = options || [];
  if(!arr.length) return undefined;
  var i = Number(index);
  if(!isFinite(i)) i = 0;
  i = Math.round(i);
  if(i < 0) i = 0;
  if(i > arr.length - 1) i = arr.length - 1;
  return arr[i];
}

/** 值 -> 滚轮索引；不存在则返回 0 */
export function wheelIndex(options, value){
  var arr = options || [];
  var i = arr.indexOf(value);
  return i < 0 ? 0 : i;
}

/** 组装 YYYY-MM-DD（不足两位补零） */
export function formatWheelDate(year, month, day){
  return String(Number(year)) + '-' + String(Number(month)).padStart(2,'0') + '-' + String(Number(day)).padStart(2,'0');
}

/** 组装 HH:MM（不足两位补零） */
export function formatWheelTime(hour, minute){
  return String(Number(hour)).padStart(2,'0') + ':' + String(Number(minute)).padStart(2,'0');
}

/** 解析 YYYY-MM-DD -> {y,m,d}；非法日期（含 2 月 30 日）返回 null */
export function parseWheelDate(str){
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(str == null ? '' : str).trim());
  if(!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y:y, m:mo, d:d };
}

/** 解析 HH:MM -> {h,m}；非法返回 null */
export function parseWheelTime(str){
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(str == null ? '' : str).trim());
  if(!m) return null;
  var h = +m[1], mi = +m[2];
  if(h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h:h, m:mi };
}

/* ============ 图片压缩与存储 ============ */
/** 图片存储限制：背景最大边长 / JPEG 质量 / 单张存上限 */
export const IMAGE_LIMITS = { bgMaxDim: 1280, bgQuality: 0.72, maxStoredBytes: 1024 * 1024 };

/** 格式化字节数为可读文本 */
export function formatBytes(bytes){
  var n = Number(bytes);
  if(!isFinite(n) || n <= 0) return '0 B';
  if(n < 1024) return n + ' B';
  if(n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * 估算 data URL 解码后的字节数（base64 每 4 字符对应 3 字节，末尾 = 为填充）
 * 用于判断图片是否过大，而不用真的解码
 */
export function estimateDataUrlBytes(dataUrl){
  if(!dataUrl || typeof dataUrl !== 'string') return 0;
  var i = dataUrl.indexOf(',');
  var b64 = (i >= 0 ? dataUrl.slice(i + 1) : dataUrl).replace(/\s/g, '');
  if(!b64.length) return 0;
  var pad = 0;
  if(b64.slice(-2) === '==') pad = 2;
  else if(b64.slice(-1) === '=') pad = 1;
  var bytes = Math.floor(b64.length * 3 / 4) - pad;
  return bytes > 0 ? bytes : 0;
}

/**
 * 按最大边长计算缩放尺寸：保持宽高比，且不放大
 * @returns {{width:number, height:number, changed:boolean}}
 */
export function computeResize(width, height, maxDim){
  var w = Number(width), h = Number(height), max = Number(maxDim);
  if(!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return { width:0, height:0, changed:false };
  if(!isFinite(max) || max <= 0) return { width:w, height:h, changed:false };
  var longest = Math.max(w, h);
  if(longest <= max) return { width:w, height:h, changed:false };
  var ratio = max / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
    changed: true
  };
}

/**
 * 判断是否为「本地存储配额超限」错误
 * 各浏览器表现不一致：名称 QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED，
 * 或仅带 code 22 / 1014
 */
export function isQuotaError(err){
  if(!err) return false;
  var name = err.name || '';
  if(name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  var code = err.code;
  return code === 22 || code === 1014;
}

/**
 * 存储写入失败的准确提示。
 * 关键：配额满 ≠ 手机存储空间不足，必须区分，否则误导用户
 */
export function describeStorageError(err){
  if(isQuotaError(err)){
    return '本地存储配额已满（这不是手机存储空间不足）\n\n应用数据存放在浏览器本地存储中，容量有上限。\n建议：清除自定义背景，或减少记录里的图片。';
  }
  return '保存失败：' + ((err && err.message) || '未知原因');
}
