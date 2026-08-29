# 工作备忘录 v1.5.0（Debug）

修复用户真机反馈：自定义背景清除无效、新建计划时间固定 09:00、背景图文字可读性差、退出应用后收不到提醒。

## 修复与新增

### Issue-33：自定义背景「清除」按钮无效
- 根因：清除按钮位于 `data-bg-upload` 整行内，事件委托中先判断了整行上传，导致点击清除被误判为打开相册。
- 修复：将 `data-bg-clear` 判断提前到 `data-bg-upload` 之前。

### Issue-34：新建计划时间默认 09:00
- 新增 `getNowTime()` 返回当前 HH:MM。
- `loadEditor` 新建记录分支 `time` 默认改为 `getNowTime()`，不再是固定 `09:00`。

### Issue-35：自定义字体大小与颜色，改善背景图可读性
- `settings` 新增 `fontSize`（小/标准/大/特大）与 `textColor`（自动/白/黑）。
- CSS 加 `--app-font-scale`，关键文字类（标题、卡片文字、概览数字等）使用 `calc(px * var(--app-font-scale))` 跟随缩放。
- 自定义背景时给 `app` 添加 `has-bg` 类，自动为关键文字加 `text-shadow`：
  - 自动/主题色使用主题 token `--text-shadow`；
  - 白色字使用黑色投影，黑色字使用白色投影。
- 「我的」页新增「字体大小」「文字颜色」两排 chips。

### Issue-36：退出应用后仍可收到提醒
- 集成 `@capacitor/local-notifications@^7.0.0`，利用 Android 系统 AlarmManager 安排精确本地通知。
- 保存带提醒的记录时自动调度一条系统通知；删除记录时取消对应通知。
- 启动时 `rescheduleAllNotifications()` 重建所有有效提醒，解决 App 重启/被系统杀死后提醒丢失的问题。
- 记录 id 哈希映射为 32 位正整数作为通知 id，兼容 Android 整型要求。
- 浏览器端或未授权时优雅降级，不阻塞 App 启动。

## 质量

- 全量单元测试 **263 例通过 / 0 失败**。
- 新增测试文件：
  - `tests/issue-33-clear-bg.test.js`（3 例）
  - `tests/issue-34-now-time.test.js`（3 例）
  - `tests/issue-35-font-readability.test.js`（10 例）
  - `tests/issue-36-local-notifications.test.js`（9 例）
- 修复 `tests/issue-01-date.test.js` 中 `getTodayStr` 在 UTC/本地跨日期临界点的断言偏差。

## 安装

Android 9+，下载 `workmemo-app-debug-v1.5.0.apk` 后允许「未知来源」安装即可。首次安装后会请求通知权限，建议允许以获得退出应用后的提醒。

## 已知局限

- Android 各厂商对后台通知/精确闹钟限制不同，部分机型需在系统设置中授予「允许后台运行」「自启动」权限才能稳定收到提醒。
- 本地通知依赖系统时间；若用户修改系统时间，提醒可能不准。
