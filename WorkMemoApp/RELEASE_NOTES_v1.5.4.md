# 工作备忘录 v1.5.4（插件调用看门狗 · 闪退可诊断化）

v1.5.3 已修复闪退根因（`LocalNotifications.cancel({})` 空载荷 NPE）。
v1.5.4 在其基础上补一层**防御网**：即使未来还有别的插件调用在 Java 线程把进程带崩，
下次启动也能在崩溃面板里**指明嫌疑调用**，而不是再次沉默退出。

---

## 问题背景：为什么「Java 层崩溃」特别难查

Capacitor 把插件方法派发到独立的 `HandlerThread`（线程名 `CapacitorPlugins`）执行。
若插件内部抛未捕获异常，`Bridge` 直接 `throw RuntimeException` 杀进程，且这个 Promise
**永远不会 reject**。于是：

- `try/catch` 抓不到（异常不在 JS 线程）
- `.catch()` 抓不到（Promise 未 reject）
- 把调用延后、包 try、加超时 —— 全无用，只会把崩溃推迟同样时间

v1.5.3 的修复是**对症下药**（修掉了非法的空载荷）。但「这类崩溃 JS 毫无感知」是
**结构性问题**，不止通知插件一处。若日后引入别的插件、或系统 WebView 行为变化，
同样会再发生「打开即闪退且无从下手」。

---

## 修复内容（Issue-41）

### 1. 插件调用看门狗

新增 `safeLN(method, args)` 包装所有 `LocalNotifications` 调用：

```js
function safeLN(method, args){
  if(!LN || typeof LN[method] !== 'function') return Promise.resolve(null);
  markPluginCall('LocalNotifications', method);     // 调用前打标记
  var ret;
  try { ret = LN[method].apply(LN, args || []); }
  catch(e){ clearPluginCall(); return Promise.reject(e); }
  return Promise.resolve(ret).then(function(r){ clearPluginCall(); return r; })  // 成功清除
    .catch(function(e){ clearPluginCall(); throw e; });
}
```

`schedule` / `cancel` / `requestPermissions` / `getPending` 全部走它。

### 2. 标记机制（纯函数，可测）

| 函数 | 行为 |
|---|---|
| `markPluginCall(plugin, method)` | 调用前写 `{plugin, method, at}` 到 `localStorage['workmemo-plugin-call']` |
| `clearPluginCall()` | 调用成功 resolve 后清除 |
| `readUnfinishedPluginCall()` | 启动诊断时读取残留标记 |
| `buildPluginCrashHint(rec)` | 把残留标记转成可读的崩溃线索 |

### 3. 事后诊断（经典脚本，注册早于 module）

页面解析后立即检查残留标记，若存在则写入崩溃日志。下次崩溃面板会显示：

```
疑似原生插件崩溃
上一次调用 LocalNotifications.cancel 后进程异常退出
Capacitor 插件在独立的 Java 线程执行，异常直接杀进程且 JS 无法捕获。
时间：2026-08-30T19:42:50Z
请抓 adb logcat -d | grep -A 40 "FATAL EXCEPTION" 获取真实堆栈。
```

---

## 测试

- `tests/issue-41-plugin-call-watchdog.test.js`（**14 例**）：
  - `markPluginCall` / `clearPluginCall` / `readUnfinishedPluginCall` 行为
  - 标记损坏时 `readUnfinishedPluginCall` 返回 null 而不抛
  - `buildPluginCrashHint` 产出含「Java 线程」「adb logcat」指引的线索
  - `PLUGIN_CALL_KEY` 与经典脚本字面量一致（防两处不同步）
  - **静态断言：HTML 中不再有裸 `LN.cancel/schedule/requestPermissions/getPending` 调用**
  - `safeLN` 定义含 mark 与 clear；三个函数均走 `safeLN`
  - 经典脚本看门狗消费残留标记并 `save('plugin', ...)`
- 同步修正 `tests/issue-40-*.test.js`：实现改为 `safeLN` 后，原「锁死 `LN.getPending(` 写法」
  的断言改为验证行为（先 getPending / safeLN 不支持方法时降级返回 null），不锁死实现
- **全量 329 例通过 / 0 失败**

---

## 安装与验证

1. 安装 `workmemo-app-debug-v1.5.4.apk`（覆盖安装，数据不丢失）
2. v1.5.3 的根因已修复，正常打开应立即进入界面
3. 若日后**再次**出现同类闪退，崩溃面板会直接点名嫌疑的插件调用，
   把那行信息发我即可定位，不用再经历一次「Perfetto + logcat」的完整取证流程

---

## 与前几版关系

| 版本 | 内容 | 作用 |
|---|---|---|
| v1.5.3 | 修复 `cancel({})` 空载荷 NPE（根因） | 直接止血 |
| **v1.5.4** | **插件调用看门狗（可诊断化防御）** | **让同类问题下次可自愈定位** |

---

## 已知限制

- 看门狗给出的是「嫌疑调用」，不是堆栈。真正确认仍需 `adb logcat`（v1.5.3 发布说明已给命令）。
- 这只覆盖**通过 `safeLN` 发起的 LocalNotifications 调用**。若日后引入其他 Capacitor 插件，
  应同样用「调用前 mark / 成功后 clear」的模式，或扩展 `safeLN` 使其支持任意插件。
- `@capacitor/local-notifications` 仍落后 core 6 个 minor，长期建议统一版本。
