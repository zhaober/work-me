/**
 * 工作计划与复盘备忘录 App - 核心工具函数（纯逻辑，可测试）
 */
import LZString from './lz-string.js';

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
    '--progress-track':'#F0E2D6', '--check-off':'#C9CDD6', '--body':'#2A2D36', '--danger':'#E53935',
    '--text-shadow':'0 1px 3px rgba(255,255,255,0.65)'
  },
  dark: {
    '--bg':'#0E1014', '--card':'#1A1D24', '--border':'#2A2E37',
    '--text':'#EDEFF4', '--text-2':'#9AA0AC', '--text-3':'#6B7180',
    '--accent':'#6E8BFF', '--accent-soft':'#1E2540', '--accent-stroke':'#33407A',
    '--orange':'#FF9A55', '--orange-soft':'#3A2A1E', '--orange-card':'#2A2018', '--orange-border':'#5A3E2A',
    '--progress-track':'#2E2620', '--check-off':'#4A4F5A', '--body':'#C8CDD6', '--danger':'#FF5B56',
    '--text-shadow':'0 1px 3px rgba(0,0,0,0.55)'
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

/**
 * 系统字体栈（离线可用）。
 *
 * 这里刻意不使用任何需要联网下载的字体（Inter / Noto Sans SC 等）。
 * 原因：App 是纯本地离线应用，字体若走 <link rel="stylesheet"> 引入，
 * 在无法访问该域名的网络环境下，样式表是**渲染阻塞资源**，
 * WebView 会一直等到请求超时才绘制首屏，表现为「打开后长时间白屏」。
 * 系统字体零请求、零延迟，中文与西文的观感也完全够用。
 */
export const SYSTEM_FONT_STACK =
  '"PingFang SC","Microsoft YaHei",-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

export const FONT_SIZE_OPTIONS = ['small','normal','large','huge'];
export const TEXT_COLOR_OPTIONS = ['auto','white','black'];
export const FONT_SIZE_SCALE = { small:0.875, normal:1, large:1.125, huge:1.25 };

/** 规范化字体大小选项 */
export function normalizeFontSize(s){ return FONT_SIZE_OPTIONS.indexOf(s) >= 0 ? s : 'normal'; }
/** 规范化文字颜色选项 */
export function normalizeTextColor(s){ return TEXT_COLOR_OPTIONS.indexOf(s) >= 0 ? s : 'auto'; }
/** 获取字体大小对应的缩放系数 */
export function getFontScale(s){ return FONT_SIZE_SCALE[normalizeFontSize(s)] || 1; }

/** 设置默认值：浅色主题、开启音效、经典风格、无背景、标准字体/自动颜色 */
export function getDefaultSettings(){ return { theme:'light', soundOn:true, style:'classic', bgImage:null, fontSize:'normal', textColor:'auto' }; }
/** 规范化用户设置：缺失/非法字段回落默认值，不影响已合法字段；输入非对象时返回默认 */
export function normalizeSettings(input){
  const d = getDefaultSettings();
  if(!input || typeof input !== 'object') return d;
  return {
    theme:     normalizeTheme(input.theme) || 'light',
    soundOn:   input.soundOn !== false,
    style:     normalizeStyle(input.style),
    bgImage:   input.bgImage ? input.bgImage : null,
    fontSize:  normalizeFontSize(input.fontSize),
    textColor: normalizeTextColor(input.textColor),
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

/** 获取当前时间 HH:MM */
export function getNowTime(){
  var d = new Date();
  return formatWheelTime(d.getHours(), d.getMinutes());
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

/* ============ 存储优化（记录内图片压缩 / 用量统计） ============ */
/** 记录内图片的存储限制：最大边长 / JPEG 质量 / 超过该字节数才纳入「优化」 */
export const RECORD_IMAGE_LIMITS = { maxDim: 1600, quality: 0.82, compressAboveBytes: 300 * 1024 };

/** 估算一段字符串写入 localStorage 的字节占用（UTF-16，约 2 字节/字符） */
export function estimateStringBytes(str){
  return (typeof str === 'string' && str.length) ? str.length * 2 : 0;
}

/** 累加所有记录内图片的字节占用（无图/非法安全） */
export function sumImageBytes(records){
  var total = 0, recs = records || {};
  Object.keys(recs).forEach(function(k){
    var img = recs[k] && recs[k].image;
    if(typeof img === 'string' && img.length) total += estimateDataUrlBytes(img);
  });
  return total;
}

/** 判断某张图片是否超过阈值、值得重新压缩（空值/非法阈值返回 false） */
export function shouldCompressImage(dataUrl, maxBytes){
  var n = Number(maxBytes);
  if(!isFinite(n) || n <= 0) return false;
  if(typeof dataUrl !== 'string' || !dataUrl.length) return false;
  return estimateDataUrlBytes(dataUrl) > n;
}

/** 统计超过阈值的图片数量与总占用 */
export function countLargeImages(records, maxBytes){
  var recs = records || {}, threshold = (isFinite(Number(maxBytes)) && Number(maxBytes) > 0) ? Number(maxBytes) : 0;
  var count = 0, total = 0;
  Object.keys(recs).forEach(function(k){
    var img = recs[k] && recs[k].image;
    if(typeof img === 'string' && img.length){
      var b = estimateDataUrlBytes(img);
      if(b > threshold){ count++; total += b; }
    }
  });
  return { count: count, totalBytes: total };
}

/* ============ 图片查看器（放大 / 缩小 / 平移） ============ */
/** 图片查看器缩放限制：最小/最大倍率、单步增量（滚轮 / 按钮共用） */
export const IMAGE_VIEWER_LIMITS = { minScale: 1, maxScale: 5, step: 0.3 };

/** 把缩放倍率夹到 [min, max]；非法值回落 1 */
export function clampScale(scale, min, max){
  var s = Number(scale);
  if(!isFinite(s) || s <= 0) s = 1;
  var lo = Number(min), hi = Number(max);
  if(!isFinite(lo)) lo = 1;
  if(!isFinite(hi)) hi = 5;
  if(s < lo) s = lo;
  if(s > hi) s = hi;
  return s;
}

/**
 * 计算下一步缩放倍率（倍增式，滚轮与按钮共用）
 * @param {number} current 当前倍率
 * @param {number} delta 增量：>0 放大，<0 缩小；0 或非法时原样夹取返回
 * @param {number} min 最小倍率
 * @param {number} max 最大倍率
 */
export function nextImageScale(current, delta, min, max){
  var s = Number(current);
  if(!isFinite(s) || s <= 0) s = 1;
  var d = Number(delta);
  if(!isFinite(d) || d === 0) return clampScale(s, min, max);
  s = d > 0 ? s * (1 + d) : s / (1 - d);
  return clampScale(s, min, max);
}

/** 双击 / 双指点按在 1x 与目标倍率（默认 2x）之间切换 */
export function toggleImageScale(current, min, max, target){
  var s = Number(current); if(!isFinite(s)) s = 1;
  var lo = Number(min); if(!isFinite(lo)) lo = 1;
  var hi = Number(max); if(!isFinite(hi)) hi = 5;
  var t = Number(target); if(!(t > lo)) t = 2;
  // 已接近最小倍率（视为未放大）则放大到目标；否则复位到最小
  return Math.abs(s - lo) < 0.05 ? clampScale(t, lo, hi) : clampScale(lo, lo, hi);
}

/* ============ 多级提醒（12306 式） ============ */
/** 默认提醒方案：提前 3 小时开始，每 30 分钟一次，最晚提前 5 分钟，并含到点提醒 */
export const DEFAULT_REMINDER_PLAN = { startMin: 180, intervalMin: 30, stopMin: 5, includeTarget: true };

/** 规范化提醒方案：缺失或非法字段回落默认值 */
export function normalizeReminderPlan(plan){
  var d = DEFAULT_REMINDER_PLAN;
  var p = plan || {};
  var startMin = Number(p.startMin), intervalMin = Number(p.intervalMin), stopMin = Number(p.stopMin);
  return {
    startMin: isFinite(startMin) && startMin > 0 ? startMin : d.startMin,
    intervalMin: isFinite(intervalMin) && intervalMin > 0 ? intervalMin : d.intervalMin,
    stopMin: isFinite(stopMin) && stopMin >= 0 ? stopMin : d.stopMin,
    includeTarget: typeof p.includeTarget === 'boolean' ? p.includeTarget : d.includeTarget
  };
}

/** 把提前量（分钟）格式化为「还有 X 小时 Y 分钟」 */
export function formatReminderLabel(leadMin){
  var m = Number(leadMin);
  if(!isFinite(m) || m <= 0) return '时间到';
  if(m < 60) return '还有 ' + m + ' 分钟';
  var h = Math.floor(m / 60), rem = m % 60;
  if(rem === 0) return '还有 ' + h + ' 小时';
  return '还有 ' + h + ' 小时 ' + rem + ' 分钟';
}

/** 由日期 YYYY-MM-DD 与时间 HH:MM 组合出本地时间戳；任一非法返回 NaN */
export function combineDateTime(dateStr, timeStr){
  var d = parseWheelDate(dateStr), t = parseWheelTime(timeStr);
  if(!d || !t) return NaN;
  return new Date(d.y, d.m - 1, d.d, t.h, t.m, 0, 0).getTime();
}

/**
 * 计算提前提醒的分钟序列（从 startMin 递减到 stopMin，末尾不足一步时补上 stopMin）
 * @returns {number[]} 降序的提前分钟数
 */
export function buildReminderLeads(plan){
  var p = normalizeReminderPlan(plan);
  var leads = [];
  for(var lead = p.startMin; lead >= p.stopMin; lead -= p.intervalMin){
    leads.push(lead);
  }
  // 递减序列未落在 stopMin 上时补一次，保证「截止前最后一次提醒」
  if(leads.length && leads[leads.length - 1] > p.stopMin) leads.push(p.stopMin);
  if(!leads.length) leads.push(p.stopMin);
  return leads;
}

/**
 * 生成提醒时刻表（12306 式多级提醒）
 * @param {number} targetMs 目标时刻时间戳（用户设定的提醒时间）
 * @param {number} nowMs 当前时间戳
 * @param {object} plan 提醒方案
 * @returns {Array<{at:number, leadMin:number, label:string}>} 按时间升序，
 *          仅包含仍未来临且不晚于目标时刻的提醒
 */
export function buildReminderSchedule(targetMs, nowMs, plan){
  var target = Number(targetMs), now = Number(nowMs);
  if(!isFinite(target) || !isFinite(now)) return [];
  var p = normalizeReminderPlan(plan);
  var MIN = 60000;
  var out = [];
  buildReminderLeads(p).forEach(function(lead){
    var at = target - lead * MIN;
    if(at > now && at <= target) out.push({ at: at, leadMin: lead, label: formatReminderLabel(lead) });
  });
  if(p.includeTarget && target > now) out.push({ at: target, leadMin: 0, label: '时间到' });
  out.sort(function(a, b){ return a.at - b.at; });
  return out;
}

/* ============ IndexedDB 存储内核（数据编解码，纯函数） ============ */

/** IndexedDB 库名 / 版本 / 对象仓库名 / 索引名 */
export const IDB_NAME = 'work-memo-idb';
export const IDB_VERSION = 1;
export const STORES = {
  notes: 'notes',          // 主表：笔记元数据（可索引、供列表查询）
  contents: 'note_contents', // 正文表：压缩正文，与元数据分表，列表查询不加载
  images: 'note_images',   // 图片仓库（Blob）
  meta: 'meta'             // 键值表：folders / events / settings
};
export const NOTE_INDEXES = ['by_update', 'by_folder', 'by_date'];
/** localStorage 时代的旧键名，用于一次性迁移 */
export const LEGACY_LS_KEY = 'work-memo-db-v1';
/** 崩溃日志键。与业务数据分离：启动失败时业务库可能不可用，日志仍要能取到 */
export const CRASH_LOG_KEY = 'work-memo-crash-log';
/** 启动阶段顺序，用于定位崩溃发生在哪一步 */
export const BOOT_STAGES = ['html-parsed', 'module-loaded', 'store-loading', 'rendered'];
/**
 * 存储引导超时（毫秒）。
 * IndexedDB 在个别设备上可能既不 resolve 也不 reject（存储权限被拒、
 * 库损坏、隐私模式等），此时 Promise 永远挂起，.then/.catch 都不会执行，
 * App 会一直停在空白页 —— 用户看到的就是「打不开软件」。
 * 超时后降级到本地存储，保证 App 一定能打开。
 */
export const BOOT_STORE_TIMEOUT = 6000;
/** 看门狗延迟（毫秒）。必须大于存储超时，否则会在降级完成前误弹错误面板 */
export const BOOT_WATCHDOG_DELAY = 10000;
/** 超时哨兵值，用于区分「正常完成」与「超时降级」 */
export const BOOT_TIMEOUT_SENTINEL = '__BOOT_TIMEOUT__';

/** 判断存储引导结果是否为「超时」哨兵 */
export function isBootTimeout(result){ return result === BOOT_TIMEOUT_SENTINEL; }

/**
 * 给 Promise 加超时：超时后以哨兵值兑现，而不是永远挂起。
 * 超时或原 Promise 兑现后都会清理定时器，避免悬挂 timer 拖住页面卸载。
 * @param {*} promise 原始 Promise
 * @param {number} ms 超时毫秒
 * @param {*} sentinel 超时时的兑现值
 */
export function raceTimeout(promise, ms, sentinel){
  var timer = null;
  var guard = new Promise(function(resolve){
    timer = setTimeout(function(){ resolve(sentinel); }, ms);
  });
  return Promise.race([Promise.resolve(promise), guard]).then(function(v){
    clearTimeout(timer);
    return v;
  }, function(e){
    clearTimeout(timer);
    throw e;
  });
}

/**
 * 把崩溃记录与所处启动阶段拼成可读报告，供错误面板展示与一键复制。
 * 设计为纯函数，便于在 Node 下直接断言。
 * @param {?object} rec 崩溃记录 {kind,message,stack,at,ua}
 * @param {?string} stage 当前启动阶段
 * @returns {{title:string, detail:string}}
 */
export function buildCrashReport(rec, stage){
  var s = (typeof stage === 'string' && stage) ? stage : 'unknown';
  var lines = [];
  if(!rec || typeof rec !== 'object' || Array.isArray(rec)){
    lines.push('阶段：' + s);
    lines.push('未捕获到具体错误（可能是数据载入卡住，或进程被系统回收）。');
    return { title: '启动未完成', detail: lines.join('\n') };
  }
  var kindMap = { error: '脚本错误', promise: '未处理的 Promise 异常', resource: '资源加载失败' };
  var kind = kindMap[rec.kind] || (typeof rec.kind === 'string' && rec.kind) || '未知异常';
  lines.push('类型：' + kind);
  lines.push('阶段：' + s);
  if(rec.at) lines.push('时间：' + String(rec.at));
  if(rec.message) lines.push('信息：' + String(rec.message));
  if(rec.stack) lines.push('堆栈：\n' + String(rec.stack));
  if(rec.ua) lines.push('环境：' + String(rec.ua));
  return { title: kind, detail: lines.join('\n') };
}

/**
 * 正文 + 清单 → 压缩后的 Uint8Array（LZString，纯文本压缩率极高）
 * 长文本走压缩，替代把整段 JSON 明文塞进库里。
 */
export function encodeNoteContent(body, checklist){
  var payload = JSON.stringify({
    body: typeof body === 'string' ? body : (body == null ? '' : String(body)),
    checklist: Array.isArray(checklist) ? checklist : []
  });
  return LZString.compressToUint8Array(payload);
}

/**
 * 压缩数据 → { body, checklist }；任何异常都安全回落为空内容，不抛错。
 */
export function decodeNoteContent(u8){
  var empty = { body: '', checklist: [] };
  if(!u8 || !u8.length) return empty;
  try{
    var arr = (u8 instanceof Uint8Array) ? u8 : new Uint8Array(u8);
    var s = LZString.decompressFromUint8Array(arr);
    if(!s) return empty;
    var o = JSON.parse(s);
    if(!o || typeof o !== 'object') return empty;
    return {
      body: typeof o.body === 'string' ? o.body : '',
      checklist: Array.isArray(o.checklist) ? o.checklist : []
    };
  }catch(e){ return empty; }
}

/**
 * 样式/小字段 → Uint8Array（体积很小，用 TextEncoder 直存，无需压缩）
 */
export function encodeStyleData(obj){
  var s = JSON.stringify(obj == null ? {} : obj);
  if(typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  var out = new Uint8Array(s.length);
  for(var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Uint8Array → 样式对象；失败返回空对象 */
export function decodeStyleData(u8){
  if(!u8 || !u8.length) return {};
  try{
    var arr = (u8 instanceof Uint8Array) ? u8 : new Uint8Array(u8);
    var s;
    if(typeof TextDecoder !== 'undefined') s = new TextDecoder().decode(arr);
    else {
      s = '';
      for(var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    }
    var o = JSON.parse(s);
    return (o && typeof o === 'object') ? o : {};
  }catch(e){ return {}; }
}

/**
 * 运行时记录对象 → IndexedDB 行
 * 正文/清单进 content_compressed，标签进 style_data，图片只留 image_id 外键。
 */
export function recordToRow(rec, nowMs){
  var r = rec || {};
  var ts = Number(nowMs);
  return {
    id: r.id,
    type: r.type || 'plan',
    folderId: (r.folderId === undefined ? null : r.folderId),
    title: typeof r.title === 'string' ? r.title : '',
    date: r.date || '',
    time: r.time || '',
    reminder: (r.reminder === undefined || r.reminder === null) ? null : r.reminder,
    priority: typeof r.priority === 'number' ? r.priority : 0,
    image_id: r.image_id || null,
    update_time: typeof r.update_time === 'number' ? r.update_time : (isFinite(ts) ? ts : Date.now()),
    content_compressed: encodeNoteContent(r.body, r.checklist),
    style_data: encodeStyleData({ tags: Array.isArray(r.tags) ? r.tags : [] })
  };
}

/** IndexedDB 行 → 运行时记录对象（image 字段由运行时按 image_id 填充为 blob URL） */
export function rowToRecord(row){
  if(!row) return null;
  var c = decodeNoteContent(row.content_compressed);
  var st = decodeStyleData(row.style_data);
  return {
    id: row.id,
    type: row.type || 'plan',
    folderId: row.folderId,
    title: row.title || '',
    date: row.date || '',
    time: row.time || '',
    reminder: (row.reminder === undefined) ? null : row.reminder,
    tags: Array.isArray(st.tags) ? st.tags : [],
    priority: typeof row.priority === 'number' ? row.priority : 0,
    image_id: row.image_id || null,
    image: null,
    checklist: c.checklist,
    body: c.body,
    update_time: row.update_time || 0
  };
}

/**
 * 列表页裁剪：只保留渲染列表所需的轻量字段，
 * 不返回 content_compressed / style_data，避免整库内容进内存。
 */
export function noteListRow(row){
  if(!row) return null;
  return {
    id: row.id,
    title: row.title || '',
    type: row.type || 'plan',
    folderId: row.folderId,
    date: row.date || '',
    time: row.time || '',
    priority: typeof row.priority === 'number' ? row.priority : 0,
    reminder: (row.reminder === undefined) ? null : row.reminder,
    image_id: row.image_id || null,
    update_time: row.update_time || 0
  };
}

/** 估算一行笔记的字节占用（用于「我的」存储用量展示） */
export function noteRowBytes(row){
  if(!row) return 0;
  var n = 0;
  if(row.content_compressed && row.content_compressed.byteLength) n += row.content_compressed.byteLength;
  if(row.style_data && row.style_data.byteLength) n += row.style_data.byteLength;
  if(typeof row.title === 'string') n += row.title.length * 3; // UTF-8 中文按 3 字节估算
  return n;
}

/**
 * 笔记行拆分为「元数据行」与「正文行」。
 * 分表的唯一目的：列表页只扫 notes 表，完全不触碰 content_compressed，
 * 避免每次渲染列表都把全库正文反序列化进内存。
 */
export function splitNoteRow(row){
  if(!row) return { meta: null, content: null };
  var meta = {
    id: row.id,
    type: row.type,
    folderId: row.folderId,
    title: row.title,
    date: row.date,
    time: row.time,
    reminder: row.reminder,
    priority: row.priority,
    image_id: row.image_id,
    update_time: row.update_time
  };
  var content = {
    id: row.id,
    content_compressed: row.content_compressed || null,
    style_data: row.style_data || null
  };
  return { meta: meta, content: content };
}

/** 元数据行 + 正文行 → 完整行（供 rowToRecord 使用） */
export function mergeNoteRows(meta, content){
  if(!meta) return null;
  var row = {
    id: meta.id,
    type: meta.type,
    folderId: meta.folderId,
    title: meta.title,
    date: meta.date,
    time: meta.time,
    reminder: meta.reminder,
    priority: meta.priority,
    image_id: meta.image_id,
    update_time: meta.update_time,
    content_compressed: (content && content.content_compressed) || null,
    style_data: (content && content.style_data) || null
  };
  return row;
}

/* ============ 图片管线（WebP 压缩 + 缩略图 + 哈希去重） ============ */

/** 图片压缩参数：大图长边 1080 / WebP 75%，缩略图 200×200 / WebP 65% */
export const IMAGE_PIPELINE = {
  fullMaxDim: 1080,
  fullType: 'image/webp',
  fullQuality: 0.75,
  thumbSize: 200,
  thumbType: 'image/webp',
  thumbQuality: 0.65,
  /** 不支持 WebP 时的回落格式 */
  fallbackType: 'image/jpeg',
  hashAlgo: 'SHA-256'
};

/**
 * 缩略图居中裁剪区（源图坐标）：取短边为正方形边长，居中裁切。
 * 只算源矩形；输出尺寸固定为 IMAGE_PIPELINE.thumbSize。
 */
export function computeThumbRect(w, h){
  var sw = Number(w) || 0, sh = Number(h) || 0;
  if(sw <= 0 || sh <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0, side: 0 };
  var side = Math.min(sw, sh);
  return {
    sx: Math.floor((sw - side) / 2),
    sy: Math.floor((sh - side) / 2),
    sw: side,
    sh: side,
    side: side
  };
}

/** ArrayBuffer / Uint8Array → 十六进制字符串（哈希展示与索引） */
export function toHex(buf){
  if(!buf) return '';
  var arr = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  var s = '';
  for(var i = 0; i < arr.length; i++){
    var hex = arr[i].toString(16);
    s += (hex.length < 2 ? '0' + hex : hex);
  }
  return s;
}

/**
 * 非安全上下文（如 file:// 打开）下 crypto.subtle 不可用，
 * 用 FNV-1a 32bit × 4 组不同偏移拼出 128bit 指纹兜底。
 * 仅用于去重，不作安全用途。
 */
export function fallbackHashBytes(bytes){
  var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes || 0);
  var out = [];
  for(var k = 0; k < 4; k++){
    var h = 0x811c9dc5 ^ (k * 0x9e3779b9);
    for(var i = 0; i < arr.length; i++){
      h ^= arr[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  return new Uint8Array(out);
}

/**
 * 去重决策：命中已有哈希 → 复用旧记录、放弃本次 Blob 存储；
 * 否则 → 新存一份。
 */
export function dedupeDecision(existing){
  if(existing && existing.id){
    return { action: 'reuse', imageId: existing.id, reason: 'hash_exists' };
  }
  return { action: 'store', imageId: null, reason: 'new_hash' };
}

/** 组装 note_images 行 */
export function buildImageRow(info, noteId){
  var i = info || {};
  return {
    id: i.id,
    note_id: (noteId === undefined) ? (i.note_id || null) : noteId,
    hash_sha: i.hash || '',
    blob_full: i.fullBlob || null,
    blob_thumb: i.thumbBlob || null,
    w: i.width || 0,
    h: i.height || 0,
    bytes: (i.fullBlob && i.fullBlob.size ? i.fullBlob.size : 0)
         + (i.thumbBlob && i.thumbBlob.size ? i.thumbBlob.size : 0),
    created: i.created || Date.now()
  };
}

/** 生成图片记录 id：时间戳 + 随机串，避免自增计数在多端冲突 */
export function makeImageId(nowMs, rand){
  var t = Number(nowMs);
  if(!isFinite(t)) t = Date.now();
  var r = (typeof rand === 'number') ? Math.floor(Math.abs(rand) * 1e6) : Math.floor(Math.random() * 1e6);
  return 'img_' + t.toString(36) + '_' + r.toString(36);
}

/* ============ 原生通知 id 与取消载荷（ Capacitor LocalNotifications 安全调用） ============ */
/**
 * Android 通知 id 必须是 1..2147483646 的 32 位正整数：
 * 0 会被插件当作「未设置」，负数/超界会在 AlarmManager 侧抛异常。
 */
export const MAX_NOTIFICATION_ID = 2147483646;

/** 由记录 id 稳定派生出通知 id；无法派生时返回 0（0 表示不可用，调用方须跳过） */
export function notificationIdFor(recordId){
  var s = String((recordId === null || recordId === undefined) ? '' : recordId);
  if(!s) return 0;
  var h = 0;
  for(var i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return (h % MAX_NOTIFICATION_ID) + 1;
}

/** 通知 id 是否可用于原生调度 */
export function isValidNotificationId(id){
  var n = Number(id);
  return Number.isInteger(n) && n > 0 && n <= MAX_NOTIFICATION_ID;
}

/**
 * 由 getPending() 的返回值构造 cancel() 载荷。
 * 返回 null 表示「不应发起 cancel 调用」——旧版插件在 notifications 缺失时会
 * 走到 JSArray.toList() 触发 NPE，而这个 NPE 发生在 Java 的 CapacitorPlugins
 * 线程，JS 的 try/catch 与 Promise.catch 都拦不住，会直接杀死进程。
 */
export function buildCancelPayload(pending){
  if(!pending || !Array.isArray(pending.notifications) || !pending.notifications.length) return null;
  var out = [];
  for(var i = 0; i < pending.notifications.length; i++){
    var item = pending.notifications[i];
    if(!item) continue;
    var id = Number(item.id);
    if(!isValidNotificationId(id)) continue;
    var dup = false;
    for(var j = 0; j < out.length; j++){ if(out[j].id === id){ dup = true; break; } }
    if(dup) continue;
    out.push({ id: id });
  }
  return out.length ? { notifications: out } : null;
}

/** 载荷是否可安全下发给 cancel() */
export function shouldCallCancel(payload){
  return !!(payload && Array.isArray(payload.notifications) && payload.notifications.length);
}

/* ============ 原生插件调用看门狗（把 Java 层崩溃变成可诊断线索） ============ */
/**
 * 背景：Capacitor 插件方法在独立 Java 线程（CapacitorPlugins）执行，若插件内部
 * 抛未捕获异常，Bridge 直接杀进程，而该 Promise 永不 reject —— JS 的 try/catch
 * 与 .catch() 都拦不住，崩溃会「沉默」发生。
 *
 * 策略：每次调用插件前写入标记 {plugin, method, at}；调用成功（Promise resolve）
 * 后清除。若进程在回调前被杀，标记会残留。下次启动时检测到残留标记，即可推断
 * 「上一次 <plugin>.<method> 调用把进程带崩了」，并展示到崩溃面板。
 */
export const PLUGIN_CALL_KEY = 'workmemo-plugin-call';

function lsGet(key){
  try { return (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null; }
  catch(e){ return null; }
}
function lsSet(key, val){
  try { if(typeof localStorage !== 'undefined') localStorage.setItem(key, val); }
  catch(e){ /* 写不进不能影响主流程 */ }
}
function lsDel(key){
  try { if(typeof localStorage !== 'undefined') localStorage.removeItem(key); }
  catch(e){}
}

/** 标记正在调用的插件方法（调用前调用） */
export function markPluginCall(plugin, method){
  var rec = { plugin: String(plugin == null ? '' : plugin), method: String(method == null ? '' : method), at: new Date().toISOString() };
  lsSet(PLUGIN_CALL_KEY, JSON.stringify(rec));
  return rec;
}

/** 清除调用标记（调用成功 resolve 后调用） */
export function clearPluginCall(){
  lsDel(PLUGIN_CALL_KEY);
}

/** 读取残留标记（启动时诊断用）。返回 null 表示上一次无崩溃嫌疑 */
export function readUnfinishedPluginCall(){
  var raw = lsGet(PLUGIN_CALL_KEY);
  if(!raw) return null;
  try {
    var rec = JSON.parse(raw);
    if(rec && typeof rec.plugin === 'string' && rec.plugin && typeof rec.method === 'string' && rec.method) return rec;
  } catch(e){}
  return null;
}

/**
 * 由残留标记构造一条崩溃线索，用于填充崩溃面板。
 * 返回 null 表示没有可展示的插件崩溃嫌疑。
 */
export function buildPluginCrashHint(rec){
  if(!rec || !rec.plugin || !rec.method) return null;
  return {
    kind: 'plugin',
    message: '上一次调用 ' + rec.plugin + '.' + rec.method + ' 后进程异常退出',
    stack: 'Capacitor 插件在独立的 Java 线程执行，异常会直接杀进程且 JS 无法捕获。\n' +
           '时间：' + (rec.at || '未知') + '\n' +
           '请抓 adb logcat -d | grep -A 40 "FATAL EXCEPTION" 获取真实堆栈精确定位。'
  };
}
