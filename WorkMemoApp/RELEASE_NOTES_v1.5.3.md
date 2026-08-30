# 工作备忘录 v1.5.3（闪退根因修复）

**这是「打开即闪退」的真正修复版。** 前三个版本（v1.5.0 ~ v1.5.2）都在 Web 层排查，
方向错了 —— 崩溃发生在 Java 层，JS 的 try/catch 完全拦不住。

---

## 根因：`LocalNotifications.cancel({})` 触发 Java 层 NPE

用户补抓的 logcat 给出了确切堆栈（连续 3 次，每次启动必崩）：

```
FATAL EXCEPTION: CapacitorPlugins
Process: com.workmemo.app, PID: 13211
Caused by: java.lang.NullPointerException:
        Attempt to invoke virtual method 'java.util.List com.getcapacitor.JSArray.toList()'
        on a null object reference
        at ...LocalNotification.getLocalNotificationPendingList(LocalNotification.java:291)
        at ...LocalNotificationManager.cancel(LocalNotificationManager.java:400)
        at ...LocalNotificationsPlugin.cancel(LocalNotificationsPlugin.java:98)
```

触发点是启动流程里清空历史通知的一行：

```js
LN.cancel({})    // ← 修复前：空 payload
```

Capacitor 的 `PluginCall.getArray("notifications")` 在字段缺失时返回 **null**，
插件没有判空就直接 `JSArray.toList()`，于是 NPE。

---

## 为什么之前的所有兜底都失效

关键在于堆栈顶部的 **`CapacitorPlugins` 线程**。

Capacitor 把插件方法派发到独立的 `HandlerThread` 执行，异常是在 **Java 线程**抛出的，
`Bridge` 的 lambda 直接 `throw new RuntimeException(e)` 杀掉进程。这个 Promise **永远不会 reject**，因此：

| 已有措施 | 实际效果 |
|---|---|
| `rescheduleAllNotifications` 的 `try/catch` | 抓不到 —— 异常不在 JS 线程 |
| `.catch()` 链 | 抓不到 —— Promise 从未 reject |
| Issue-37 崩溃面板 + 看门狗 | 面板是 WebView 内的 JS，进程已被杀，来不及渲染 |
| Issue-39 延后 500ms 调度 | 只是把崩溃推迟了 500ms |

**结论：插件调用参数的合法性必须在调用前保证，不能指望事后捕获。**

---

## 修复内容（Issue-40）

### 1. 清空通知改为「先查询，再逐个取消」

```js
function cancelAllRecordNotifications(){
  if(!LN || typeof LN.getPending !== 'function') return Promise.resolve(false);
  return LN.getPending().then(function(pending){
    var payload = buildCancelPayload(pending);
    if(!shouldCallCancel(payload)) return false;        // 无待发通知 → 跳过，绝不调 cancel
    return LN.cancel(payload).then(...).catch(...);
  }).catch(function(){ return false; });
}
```

### 2. 通知 id 派生收敛并校验

- 新增 `notificationIdFor()`：稳定派生，结果恒为 `1..2147483646`
- 新增 `isValidNotificationId()`：`schedule` 与 `cancel` 单条前均校验
- 旧的 `h % 2147483647` 可能产出 **0**，会被插件视为「未设置」，一并修掉

### 3. 四个可测纯函数

`MAX_NOTIFICATION_ID` / `notificationIdFor` / `isValidNotificationId` /
`buildCancelPayload` / `shouldCallCancel`，全部落在 `src/app-core.js`，均有单元测试覆盖。

---

## 测试

- `tests/issue-40-notification-cancel-npe.test.js`（**19 例**）：
  - id 派生边界（空值、超界、稳定性）
  - `buildCancelPayload` 对 null / 非数组 / 空列表 / 全非法 id 一律返回 null
  - 合法 id 保留并按 id 去重
  - **静态断言：源码中不再出现 `.cancel({})`**，防止回退
  - `getPending` 不可用时必须安全跳过，而非回退到危险的空 cancel
  - `schedule` / `cancel` 单条前均有 id 校验
- 同步修正 `tests/issue-36-local-notifications.test.js`：
  原断言写死了哈希实现（`% 2147483647`），改为验证行为（值域 + 稳定性）
- **全量 315 例通过 / 0 失败**

---

## 安装与验证

1. 安装 `workmemo-app-debug-v1.5.3.apk`（覆盖安装，数据不丢失）
2. 打开后应立即进入界面。**若仍闪退**，请再抓一次 logcat：

```bash
adb logcat -c
# 复现闪退
adb logcat -d | grep -A 40 "FATAL EXCEPTION"
```

---

## 与前几个版本的关系

| 版本 | 内容 | 对本次闪退是否有效 |
|---|---|---|
| v1.5.0 | 接入原生通知、清除背景、实时时间、字体自定义 | **引入了崩溃**（`cancel({})` 随通知功能加入） |
| v1.5.1 | 移除 Google Fonts、崩溃面板 + 看门狗 | 无效（崩溃在 Java 层） |
| v1.5.2 | IndexedDB 引导超时兜底 | 无效（崩溃在 Java 层） |
| **v1.5.3** | **修复 `cancel({})` 空载荷 NPE** | **根因修复** |

v1.5.1 / v1.5.2 的改动本身仍有价值（离线可用性、诊断能力、存储健壮性），已全部保留。

---

## 遗留风险

- 这类「Java 线程抛出、JS 无法捕获」的崩溃是**结构性风险**，不止通知插件一处。
  任何 Capacitor 插件的非法参数都会以同样方式直接杀进程。
  后续可考虑在 `MainActivity` 注册 `Thread.setDefaultUncaughtExceptionHandler`
  把异常落盘，至少让闪退变得可诊断。
- `@capacitor/local-notifications` 官方最新版仍为 7.0.0，与 `@capacitor/core` 7.6.8
  存在版本差。本次崩溃与该版本差无关，但仍是长期维护上的隐患。
