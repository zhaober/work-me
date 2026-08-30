# 工作备忘录 v1.5.1（启动闪退修复）

本次为**启动问题专项修复**，针对用户反馈的「打开后直接闪退 / 打不开软件」。

---

## 修复内容

### 1. 移除 Google Fonts 外部依赖（很可能是「打不开」的直接原因）

App 头部原本引用了 `fonts.googleapis.com` 的 Inter 字体。

**问题本质**：`<link rel="stylesheet">` 是**渲染阻塞资源**。在无法访问该域名的网络环境下，
WebView 必须等到请求超时才会绘制首屏 —— 用户看到的就是「点了图标之后一直白屏，像打不开」。

**修复**：
- 移除 2 个 `preconnect` 与 1 个外部样式表，页面不再有任何远程资源
- `font-family` 去掉远程字体 Inter，改用系统字体栈
  （苹方 / 微软雅黑 / -apple-system / Segoe UI / Roboto / Helvetica Neue / Arial / sans-serif）
- `app-core.js` 新增 `SYSTEM_FONT_STACK` 常量，与 CSS 保持一致，并加测试防止回归

纯离线应用不应依赖任何需要联网加载的资源。这个修复同时提升了弱网环境下的启动速度。

### 2. 新增启动崩溃捕获层与看门狗

闪退根因无法仅靠静态排查定位，因此先补齐诊断能力 —— 让崩溃**可见**，而不是默默退出。

- **全局错误捕获**（经典脚本，注册早于 module 脚本，因此能捕获模块加载失败）：
  - `window error`（捕获阶段，含 img/script/link 资源加载失败）
  - `unhandledrejection`（未处理的 Promise 异常）
  - 错误写入 `localStorage` 专用键 `work-memo-crash-log`
- **看门狗**：`DOMContentLoaded` 后 6 秒仍未置 `__WM_BOOT_OK__` 则自动弹出错误面板
- **崩溃面板**：展示错误类型 / 所处阶段 / 错误信息 / 堆栈 / UA，
  支持**一键复制**与**清除并重试**
- **启动阶段标记**：
  `html-parsed → module-loaded → store-loading → rendered`
  可直接定位崩溃发生在 import、数据载入还是渲染阶段

### 3. 启动链路加固

- `rescheduleAllNotifications` 改为 `async` 并整体 `try/catch`：系统通知不可用只影响一个渠道，不影响主功能
- 通知调度**延后一拍**执行，且先置 `markBootOk()` 再调度：插件异常不会拖住首屏渲染
- `bootstrapStore` 失败分支也置 `markBootOk()`：用降级数据继续可用，只把异常留档
- `AndroidManifest` 补充 `SCHEDULE_EXACT_ALARM` 与 `VIBRATE` 权限
  （Android 12+ 上，未声明精确闹钟权限时提醒可能延迟数十分钟）

---

## 测试

- 新增 `tests/issue-37-crash-guard.test.js`（16 例）
- 新增 `tests/issue-38-offline-fonts.test.js`（7 例）
- 同步更新 `tests/issue-36-local-notifications.test.js` 断言以适配延后调度
- **全量 286 例通过 / 0 失败**

---

## 安装与验证

1. 安装 `workmemo-app-debug-v1.5.1.apk`（覆盖安装即可，数据不会丢失）
2. 正常情况：打开后应立即看到界面，**不再有长时间白屏**
3. 若仍无法启动：等待约 6 秒，会出现**红色错误面板**，
   请截图或点击「复制错误信息」发给我 —— 面板会显示崩溃发生在哪个阶段，可直接定位问题

---

## 已知限制

- 如果崩溃发生在 WebView 加载之前的**原生层**，错误面板也无法显示，
  那种情况需要 `adb logcat` 日志才能定位
- `@capacitor/local-notifications` 目前官方最新版为 7.0.0，
  与 `@capacitor/core` 7.6.8 存在版本差（官方更新滞后），当前运行无异常
