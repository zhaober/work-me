# WorkMemo v1.6.2 发版说明

> 发布日期：2026-08-31 · versionCode 9 / versionName 1.6.2 · Debug APK

## 本版变更（1 项）
- **移除安装包内置演示数据**：用户反馈下载安装后，App 首页出现「工作/个人/学习」三个文件夹及下属多条记录，被误认为"测试文件残留"。
  - **根因**：内核 `work-memo-app.html` 的初始 `DB.folders` / `DB.records` 硬编码了 9 个演示文件夹 + 9 条演示记录，首次打开（IndexedDB / localStorage 无历史数据）时直接显示。
  - **修复**：初始 `DB.folders` / `DB.records` 清空为 `{}`，**首次打开即空状态**；新增 `ensureDefaultFolder()` 兜底——用户新建记录却没有任何文件夹时，自动创建「默认」文件夹，避免记录无家可归；`newRecord` / `loadEditor` 的 folder 回退由硬编码 `'work'` 改为 `ensureDefaultFolder()`；相关注释由"保留内置示例数据"更新为"以空数据启动"。

## 相对 v1.6.1 的差异范围
- 仅涉及初始数据（移除演示），**不影响** v1.6.1 已交付的 5 项真机反馈修复（multi-image lightbox 破图、自定义文字颜色、正文卡片+占位、段落保存）。
- 数据迁移兼容：已安装用户升级后，旧的本地数据（IndexedDB）照常加载，不会因为清空初始 `DB` 而丢失历史记录。

## 测试
- 新增 `tests/issue-54-no-demo-data.test.js`（5 例静态断言）。
- **全量 435 例通过 / 0 失败**。
- 每次提交前均做内联模块脚本 `node --check` 语法校验。

## 构建与安装
- APK：`workmemo-app-debug-v1.6.2.apk`（约 4.06 MB）。
- 安装方式：侧载到 Android 设备（允许"未知来源"），覆盖安装即可；历史数据保留。
- 桌面调试：直接用浏览器打开 `work-memo-app.html` 即可，无需构建。

## 安全提示
- 本版发版使用的 GitHub PAT 仅以一次性环境变量注入 `gh release create`，**未写入任何文件**；建议用后到 GitHub → Settings → Developer settings → Personal access tokens 撤销。
- 仓库自 v1.6.1 起已公开，并采用 MIT 许可证。
