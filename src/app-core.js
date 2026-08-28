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
