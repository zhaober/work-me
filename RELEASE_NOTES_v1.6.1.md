# WorkMemo 工作计划与复盘备忘录 v1.6.1

真机反馈 5 项修复，逐条提交、各自带测试；全量单元测试 **430 例通过 / 0 失败**。

## 修复内容

1. **多图 lightbox 大图破图**：WebView 回收 blob URL 后大图显示破图/alt 文本。
   `imageUrlCache` 由只存字符串改为同时保留 `{url, blob}`，`resolveImageUrl(id, forceRefresh)`
   支持强制重建，大图加载失败（`onerror`）时自动用同一 blob 重建并刷新。

2. **自定义文字颜色不生效 + 偏糊**：自由取色器原只在 `click` 委托读取旧值，且
   `renderMe` 重建 `<input>` 会让原生取色面板瞬间关闭，导致用户选的颜色被丢弃。
   改为在 `#app` 上用 `input`/`change` 事件真正捕获选中色（与已保存值去重，避免重复重渲染）。
   文字阴影由 4px 收紧至 2~3px，叠在背景照片上时不再发虚。

3. **正文编辑区无醒目样式 / 无提示**：新增 `.t-body-edit` 卡片样式（背景、边框、圆角、
   最小高度、`pre-wrap`），空正文显示「请输入文本」占位提示（用 `data-placeholder` +
   `.is-empty` 类，避开 contenteditable `:empty` 的不稳定）。基础 `.t-body`（如关联计划展示）
   样式不受影响。

4 & 5. **正文段落 / 换行保存后丢失**：原用 `this.textContent` 捕获会把 `<br>/<div>` 折叠掉，
   换行与段落保存后消失。输入实时保存与 `saveEditor` 落盘均改为 `this.innerText` 保留 `\n`，
   配合编辑器 `white-space:pre-wrap`，重新打开仍是多段。正文仍以 `escapeHtml` 纯文本渲染，无 XSS。

## 安装

下载 `workmemo-app-debug-v1.6.1.apk` 安装（versionCode 8 / versionName 1.6.1）。
本地优先、数据不上云；首次使用建议在「我的 → 提醒通知」中授权通知权限。
