# 工作备忘录 v1.5.2（启动闪退修复 · 完整版）

本次为**启动问题专项修复**，针对用户反馈的「打开后直接闪退 / 打不开软件」。
v1.5.2 在 v1.5.1 基础上补齐了第 3 项（存储引导超时兜底），是本次闪退问题的**完整修复版**。

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
- **看门狗**：`DOMContentLoaded` 后 10 秒仍未置 `__WM_BOOT_OK__` 则自动弹出错误面板
- **崩溃面板**：展示错误类型 / 所处阶段 / 错误信息 / 堆栈 / UA，
  支持**一键复制**与**清除并重试**
- **启动阶段标记**：
  `html-parsed → module-loaded → store-loading → rendered`
  可直接定位崩溃发生在 import、数据载入还是渲染阶段

### 3. 存储引导超时兜底（v1.5.2 新增）

这是本轮排查中**唯一通过真实运行时验证发现的实质缺陷**，静态代码审查看不出来。

**问题**：启动入口是 `bootstrapStore().then(...).catch(...)`。个别设备上 IndexedDB
可能既不 resolve 也不 reject —— 此时 `.then` 和 `.catch` **一行都不执行**，
App 就永远停在空白页，且没有任何错误。这正是「点了图标没反应」的典型表现。

**修复**：
- `bootstrapStore()` 包一层 `raceTimeout(..., 6000ms, SENTINEL)`
- 超时后降级到 localStorage 继续启动，并把异常写入崩溃日志
- `storeBootAborted` 标记阻止迟到的 IndexedDB 结果覆盖已渲染的数据
- 看门狗延迟由 6s 上调至 10s，给降级流程留出时间，避免误报

### 4. 启动链路加固

- `rescheduleAllNotifications` 改为 `async` 并整体 `try/catch`：系统通知不可用只影响一个渠道，不影响主功能
- 通知调度**延后一拍**执行，且先置 `markBootOk()` 再调度：插件异常不会拖住首屏渲染
- `bootstrapStore` 失败分支也置 `markBootOk()`：用降级数据继续可用，只把异常留档
- `AndroidManifest` 补充 `SCHEDULE_EXACT_ALARM` 与 `VIBRATE` 权限
  （Android 12+ 上，未声明精确闹钟权限时提醒可能延迟数十分钟）

---

## 验证方式

除单元测试外，本次额外建立了**真实运行时验证**能力（`.workbuddy/boot-probe.mjs`）：
通过 Chrome DevTools Protocol 以真实计时加载页面，读取启动阶段标记与未捕获异常。

结果：

```json
{
  "stage": "rendered",
  "bootOk": true,
  "crash": null,
  "crashPanelDisplay": "none",
  "homeHTMLLen": 3885,
  "folderRows": 3,
  "idbExists": true,
  "exceptionCount": 0
}
```

即：启动走完 `rendered`、首页 DOM 正常渲染出 3 行文件夹、IndexedDB 建立成功、
**0 个未捕获异常**、崩溃面板未弹出。

> 备注：最初用 `--virtual-time-budget` 无头加载时曾出现「崩溃面板弹出、阶段停在 store-loading」
> 的假阳性。原因是虚拟时钟会把 IndexedDB 的真实异步 I/O 压成不确定结果。
> 改用 CDP + 真实 sleep 后结论为正常。**虚拟时钟不适合验证 IndexedDB 相关行为。**

---

## 测试

- `tests/issue-37-crash-guard.test.js`（16 例）—— 崩溃捕获层与看门狗
- `tests/issue-38-offline-fonts.test.js`（7 例）—— 零远程资源依赖
- `tests/issue-39-boot-timeout.test.js`（10 例）—— 存储引导超时兜底
- 同步更新 `tests/issue-36-local-notifications.test.js`、`tests/issue-30-idb-wiring.test.js`
  断言以适配延后调度与超时包装
- **全量 296 例通过 / 0 失败**

---

## 安装与验证

1. 安装 `workmemo-app-debug-v1.5.2.apk`（覆盖安装即可，数据不会丢失）
2. 正常情况：打开后应立即看到界面，**不再有长时间白屏**
3. 若仍无法启动：等待约 10 秒，会出现**红色错误面板**，
   请截图或点击「复制错误信息」发给我 —— 面板会显示崩溃发生在哪个阶段，可直接定位问题

---

## 已知限制

- 如果崩溃发生在 WebView 加载之前的**原生层**，错误面板也无法显示，
  那种情况需要 `adb logcat` 日志才能定位
- `@capacitor/local-notifications` 目前官方最新版为 7.0.0，
  与 `@capacitor/core` 7.6.8 存在版本差（官方更新滞后），当前运行无异常
