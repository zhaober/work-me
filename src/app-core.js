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

