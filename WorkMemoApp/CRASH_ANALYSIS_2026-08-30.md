# 启动闪退 · Perfetto 追踪分析报告

- **设备**：Redmi K60（codename `mondrian`）/ Android 13 / MIUI `V14.0.28.0.TMNCNXM`
- **追踪文件**：`trace-taro-TKQ1.220905.001-2026-08-30-.perfetto-trace`（64.1 MB）
- **App PID**：28320（`com.workmemo.app`）
- **分析时间**：2026-08-30

---

## 〇、根因已确认并修复（2026-08-30 19:45 更新）

用户补抓了 logcat，**根因锁定，已修复（Issue-40）**。原文以下各节的推断仍然成立（崩溃时机、进程存活判断都对），但**崩溃位置的具体成因需要更正**：不是 Capacitor 版本不匹配，而是**我们自己的调用方式错误**。

### 真实堆栈

```
FATAL EXCEPTION: CapacitorPlugins
Process: com.workmemo.app, PID: 13211
java.lang.RuntimeException: java.lang.reflect.InvocationTargetException
        at com.getcapacitor.Bridge.lambda$callPluginMethod$0(Bridge.java:853)
        at com.getcapacitor.Bridge$$ExternalSyntheticLambda0.run(D8$$SyntheticClass:0)
        at android.os.HandlerThread.run(HandlerThread.java:67)
Caused by: java.lang.reflect.InvocationTargetException
        at com.getcapacitor.PluginHandle.invoke(PluginHandle.java:138)
Caused by: java.lang.NullPointerException:
        Attempt to invoke virtual method 'java.util.List com.getcapacitor.JSArray.toList()'
        on a null object reference
        at ...localnotifications.LocalNotification.getLocalNotificationPendingList(LocalNotification.java:291)
        at ...localnotifications.LocalNotificationManager.cancel(LocalNotificationManager.java:400)
        at ...localnotifications.LocalNotificationsPlugin.cancel(LocalNotificationsPlugin.java:98)
```

同一崩溃连续出现 3 次（PID 13211 / 13212 / 13213，19:42:50 → 19:42:59 → 19:43:28），每次启动必崩。

### 触发代码

`work-memo-app.html` 第 1985 行（修复前）：

```js
function cancelAllRecordNotifications(){
  return LN.cancel({}).then(...);   // ← 空 payload
}
```

Capacitor 的 `PluginCall.getArray("notifications")` 在字段缺失时返回 **null**，插件未做判空就直接 `JSArray.toList()`，触发 NPE。

### 为什么之前的三个修复全都没用

关键在堆栈顶部的 **`CapacitorPlugins` 线程**：Capacitor 把插件方法派发到 `HandlerThread` 执行，异常在 **Java 线程**抛出，`Bridge` 的 lambda 直接 `throw new RuntimeException(e)` 杀进程。

这个 Promise **永远不会 reject**，所以：

- JS 的 `try/catch` 抓不到
- `.catch()` 抓不到
- Issue-39 加的「延后 500ms + try/catch」同样抓不到

### 修复内容（Issue-40）

1. `cancelAllRecordNotifications()` 改为先 `getPending()` 拿真实列表，经 `buildCancelPayload()` 构造合法载荷，用 `shouldCallCancel()` 守卫后才下发；空列表或插件不支持 `getPending` 时**直接跳过，绝不调用 `cancel`**。
2. 通知 id 派生收敛到 `notificationIdFor()`，保证落在 `1..2147483646`；`schedule` / `cancel` 单条前均做 `isValidNotificationId()` 校验（旧的 `% 2147483647` 可能产出 0，被插件视为「未设置」）。
3. 新增 4 个可测纯函数 + 19 条测试，含「源码中不再出现 `cancel({})`」的静态断言，防止回退。

**验证状态**：全量 315 例通过。修复已打包进 v1.5.3。

---

## 一、结论先行

**App 确实崩溃了**，不是白屏，也不是用户主动退出。

> 本节基于 Perfetto 追踪的推断，崩溃成因已在「〇」节由 logcat 更正为 `cancel({})` 空载荷 NPE。

崩溃发生在**启动后约 1.2 秒**，位置是 **Capacitor 的 WebView 桥接初始化阶段**（`com.getcapacitor.Bridge` 注册 JS↔Native 通道时）。

**这意味着本轮已做的三个修复全部命中不了这个问题**：

| 修复 | 为何无效 |
|---|---|
| Issue-36 移除 Google Fonts | 页面 HTML 从未被加载，字体根本没参与 |
| Issue-37 崩溃面板 + 看门狗 | 面板是 **WebView 内的 JS 层**，崩溃发生在它之前的 Java 层 |
| Issue-39 IndexedDB 超时兜底 | `bootstrapStore()` 从未被执行到 |

崩溃时我们的 HTML/JS **一行都没跑起来**，所以 JS 层的任何兜底都无效。必须到 Java/native 层找。

---

## 二、启动时间线（相对追踪起点）

```
7.359s  dispatchingStartProcess:com.workmemo.app
7.370s  Start proc: com.workmemo.app
7.415s  焦点：com.miui.home → com.workmemo.app          ← App 进入前台
7.426s  PID 28320 加载 APK / dex（classes.dex + classes2/3/4.dex）
7.466s  SurfaceFlinger 开始绘制 Splash Screen
7.521s  VerifyClass com.workmemo.app.MainActivity
7.544s  performCreate:com.workmemo.app.MainActivity
7.754s  performResume:com.workmemo.app.MainActivity
7.863s  launchingActivity#8:completed:com.workmemo.app   ← 系统判定启动完成（约 493ms）
7.881s  SurfaceFlinger 绘制 MainActivity 窗口
8.161s  Choreographer#doFrame 开始出帧（主线程未卡死）
─────────────────────────────────────────────────
8.575s  VerifyClass org.chromium.support_lib_boundary.WebMessageListenerBoundaryInterface
8.576s  VerifyClass androidx.webkit.internal.WebMessageAdapter
8.577s  VerifyClass androidx.webkit.WebMessageCompat / JavaScriptReplyProxy
8.578s  VerifyClass com.getcapacitor.JSObject
8.579s  VerifyClass com.getcapacitor.PluginCall
8.579s  VerifyClass com.getcapacitor.Bridge$$ExternalSyntheticLambda0   ← 最后一条
        bindService: com.google.android.webview/...SandboxedProcessService0
8.608s  system_server: finishTopCrashedActivities(...)                  ← 崩溃
8.609s  主线程阻塞于 MessageQueue.enqueueMessage（锁持有者 binder:28320_5）
8.610s  焦点：com.workmemo.app → com.miui.home
8.622s  system_server: AppErrors.crashApplicationInner(ProcessRecord, CrashInfo, ...)
8.629s  activityPause / performPause:MainActivity
```

App 实际在前台停留 **1.195 秒**（7.415s → 8.610s）。

---

## 三、崩溃确认的证据

追踪中 `system_server` 的以下调用是崩溃的**确定性标志**（不是推测）：

```
8.608s  monitor contention ... ActivityTaskManagerService$LocalService
                              .finishTopCrashedActivities(WindowProcessController, String)
8.622s  monitor contention ... AppErrors.crashApplicationInner(
                              ProcessRecord, ApplicationErrorReport$CrashInfo, int, int)
```

`finishTopCrashedActivities` 只在有 App 崩溃时被调用；随后 `crashApplicationInner` 生成崩溃报告。
这解释了为什么焦点会退回桌面 —— **是崩溃后系统结束了 Activity，不是用户按了返回键**。

同时排除了其他死法：

| 死法 | 证据 |
|---|---|
| ANR | 追踪中 `ANR` 出现 0 次；且崩溃发生在 1.2s，远早于 ANR 阈值 |
| 低内存被杀 | `lowmemorykiller/lowmemory_kill` 仅出现在**追踪配置的分类列表**中，无实际事件 |
| OOM | 崩溃时堆仅 **15,801 KB（15.8 MB）** |
| 主线程死锁 | 8.161–8.33s 一直在 `Choreographer#doFrame` 正常出帧 |

---

## 四、崩溃点定位

最后一批 `VerifyClass` 全部指向 **Capacitor 桥接的建立过程**：

- `androidx.webkit.internal.WebMessageAdapter`
- `androidx.webkit.WebMessageCompat` / `JavaScriptReplyProxy` / `JavaScriptReplyProxyImpl`
- `com.getcapacitor.JSObject` / `PluginCall` / `Bridge$$ExternalSyntheticLambda0`

这组类是 `WebViewCompat.addWebMessageListener()` 的路径 —— 即 Capacitor `Bridge` 向 WebView 注入
JS↔Native 消息通道的动作。同时系统正在 `bindService` 绑定 WebView 沙箱渲染进程
（`com.google.android.webview/org.chromium.content.app.SandboxedProcessService0`）。

**崩溃就发生在这一步。** 具体异常类型追踪里没有 —— atrace 只记录 `trace_marker` 文本，
不含 logcat，所以异常堆栈不在其中。

---

## 五、待验证假设（按可能性排序）

### 假设 1：Capacitor 版本不匹配 —— 最可疑

```
@capacitor/core                7.6.8   ← 已升到最新
@capacitor/android             7.6.8
@capacitor/cli                 7.6.8
@capacitor/local-notifications 7.0.0   ← 官方最新就是 7.0.0，落后 6 个 minor
```

`Bridge` 初始化时会注册全部插件。插件用 7.0.0 的 API 编译、却跑在 7.6.8 的 core 上，
桥接注册阶段最容易触发 `NoSuchMethodError` / `NoClassDefFoundError`。
**这条与我们观察到的崩溃时机完全吻合**（就在 `Bridge$$ExternalSyntheticLambda0` 之后）。

> 注意：这个问题是我们在 v1.5.0 引入的（为做后台提醒才装了 local-notifications）。
> 时间线上与「突然开始闪退」应当是对得上的 —— 值得向用户确认。

### 假设 2：MIUI 14 对 WebView 沙箱进程的限制

国产 ROM（尤其 MIUI）会限制 `bindService` 到 WebView 沙箱进程。崩溃恰好发生在
`bindService SandboxedProcessService0` 期间。

### 假设 3：`addWebMessageListener` 的 WebView 版本门槛

`androidx.webkit` 的 WebMessage 系列 API 要求较新 WebView。若系统 WebView 版本偏低，
会抛 `UnsupportedOperationException`。但该机是 Android 13 + 较新 MIUI，可能性低于前两条。

---

## 六、下一步：拿到真正的异常堆栈

追踪能给到「何时、何处」，给不到「什么异常」。这一步必须靠 logcat：

```bash
# 1. 清掉旧日志
adb logcat -c

# 2. 复现：点击 App 图标，等它闪退

# 3. 抓崩溃现场（AndroidRuntime 的 E 级日志 + tombstone）
adb logcat -d -v time | grep -iE "AndroidRuntime|FATAL EXCEPTION|Caused by|com.workmemo|capacitor|chromium|webview" > crash.txt
```

重点看 `FATAL EXCEPTION: main` 之后的堆栈。也可以直接：

```bash
adb logcat -d | grep -A 40 "FATAL EXCEPTION"
```

拿到堆栈后即可确认是上述哪个假设。

### 若要排除假设 1（成本最低，建议先做）

把 `local-notifications` 保持不动，但先验证是不是它引起的 —— 临时移除插件后重新打包：
若闪退消失，即锁定为插件版本不匹配，届时改为锁定 core 到 7.0.0 或等待官方同步。

---

## 七、本次追踪的能力边界

这份 trace 只启用了 **atrace（`trace_marker`）** 分类，**没有**：

- `sched_switch` / `sched_blocked_reason`（无法判断线程阻塞原因）
- WebView / Chromium 内部追踪分类（看不到页面加载进度、JS 执行）
- logcat（看不到异常堆栈）

所以「App 内部到底卡在哪一行 JS」这类问题它回答不了。

**下次抓 trace 时的建议配置**：在「系统追踪」里额外勾选
`Scheduling events`（sched）与 `WebView`，并把 App **在前台保持 10 秒以上**再停止录制
—— 本次只停留 1.2 秒就崩溃了，样本偏短。

---

## 附：分析方法

本报告的解析脚本位于 `.workbuddy/trace/`，为零依赖 Python 实现：

- `proto.py` —— 极简 protobuf wire format 解析器
- `probe.py` / `dump.py` / `find_path.py` —— 结构勘查与字段路径反推
- `atrace.py` —— 抽取 961,274 条 `trace_marker` 事件
- `timeline*.py` —— 启动时间线重建

关键字段路径（本文件适用）：

```
Trace.packet                    = field 1
TracePacket.ftrace_events       = field 1
FtraceEventBundle.event         = field 2
FtraceEvent.timestamp           = field 1
FtraceEvent.pid                 = field 2
FtraceEvent.print               = field 3      ← atrace trace_marker
PrintFtraceEvent.buf            = field 2
TracePacket.process_tree        = field 2
ProcessTree.processes           = field 1
Process{pid=1, ppid=2, cmdline=3(重复), uid=5}
```

atrace 文本格式：`B|<pid>|<名称>`（开始）/ `E|<pid>`（结束）/ `C|<pid>|<名>|<值>`（计数）/ `S|F`（异步起止）。
