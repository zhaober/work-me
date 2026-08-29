# 工作备忘录 Android App 构建手册

> 基于 Capacitor 7，将单文件 Web App（`work-memo-app.html`）封装为安卓应用。
> 本手册记录本机已验证可用的完整构建流程，供日后自行出包参考。

## 一、本机已安装的构建环境（路径固定）

| 组件 | 路径 |
| --- | --- |
| JDK 21.0.6（Microsoft Build of OpenJDK） | `C:/Users/33125/jdk21/jdk-21.0.6+7` |
| Android SDK | `C:/Users/33125/Android/Sdk` |
| Gradle 8.11.1（离线解压） | `C:/Users/33125/opt/gradle-8.11.1` |
| cmdline-tools | `C:/Users/33125/Android/Sdk/cmdline-tools/latest` |
| SDK 平台 | `platforms;android-35` + `build-tools;35.0.0` + `platform-tools` |

已持久化到**用户级环境变量**：`JAVA_HOME`、`ANDROID_HOME`。
`android/local.properties` 含 `sdk.dir=C:\Users\33125\Android\Sdk`（该文件被 gitignore，不入库）。

## 二、首次 clone 后在自己机器上搭建（Windows）

1. 安装 JDK 17+（推荐 21），设 `JAVA_HOME` 指向 JDK 根目录。
   **注意用 Windows 风格路径**，如 `C:\Java\jdk-21`，不要用 Git Bash 的 `/c/...`。
2. 安装 Android SDK：下载 commandlinetools，解压到 `SDK/cmdline-tools/latest`，
   用 `sdkmanager` 安装 `platform-tools`、`platforms;android-35`、`build-tools;35.0.0`。
3. 设 `ANDROID_HOME` 指向 SDK 根目录，并在 `android/local.properties` 写 `sdk.dir=...`。
4. `npm install`
5. `npx cap sync`

## 三、日常构建（本机）

**方式 A —— 用本地 Gradle（最快，不联网下载 Gradle）：**

```bash
cd WorkMemoApp/android
C:/Users/33125/opt/gradle-8.11.1/bin/gradle assembleDebug --no-daemon
```

**方式 B —— Capacitor 标准流程（首次会下载 Gradle wrapper）：**

```bash
npm run build:android      # 等价于 cap sync && cap build android
```

产物统一在：`android/app/build/outputs/apk/debug/app-debug.apk`

## 四、网页代码改完如何进包

修改 `work-memo-app.html` 后：

1. 复制到 `WorkMemoApp/www/index.html`；
2. 执行 `npx cap sync`（会把 www 同步进安卓 `assets/public`）；
3. 再走第三节的构建命令。

或直接 `npm run build:android`（内置 sync）。

## 五、真机安装

把 `app-debug.apk` 拷到手机 → 设置里开启「允许安装未知应用 / 未知来源」→ 点击安装。
Debug 包无需签名即可安装。

## 六、常见坑

- **`sdkmanager.bat` 报 "JAVA_HOME is set to an invalid directory"**
  → 是因为 `JAVA_HOME` 用了 Git Bash 的 `/c/Users/...`。改回 Windows 风格 `C:/Users/...` 即可。
- **`assembleDebug` 报 "Could not read script cordova.variables.gradle"**
  → 说明 `cap sync` 没跑完整。重新 `npx cap sync` 生成该文件即可。
- **`cap sync` 偶发 trash 清理子进程超时**
  → 无害，Web 资源已复制成功，直接构建即可。

## 七、生成签名 Release 包（可选，用于正式分发）

```bash
# 1) 生成签名密钥（仅一次）
keytool -genkey -v -keystore ../release-key.keystore -alias workmemo \
  -keyalg RSA -keysize 2048 -validity 10000

# 2) 在 android/app/build.gradle 的 signingConfigs 配置 release 使用上述 keystore

# 3) 构建
cd android && gradle assembleRelease --no-daemon
# 产物：android/app/build/outputs/apk/release/app-release.apk
```
