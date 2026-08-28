/**
 * 工作计划与复盘备忘录 App - 侧边栏导航配置（纯数据）
 */

export const NAV_ITEMS = [
  { id: 'home', label: '首页' },
  { id: 'calendar', label: '日历' },
  { id: 'stats', label: '统计' },
  { id: 'me', label: '我的' }
];

/** 返回带 active 标记的导航项，用于侧边栏渲染 */
export function getNavItems(activeId) {
  return NAV_ITEMS.map(it => ({ ...it, active: it.id === activeId }));
}
