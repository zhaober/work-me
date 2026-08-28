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



