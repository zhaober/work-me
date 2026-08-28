# 工作备忘录 · Android 封装工程（Capacitor）

把「工作计划与复盘备忘录」Web App 封装成可安装的 Android 应用（`.apk`）。

## 当前进度（已为你搭好）

- ✅ `android/` 原生工程**已生成并配置完成**：应用包名 `com.workmemo.app`、显示名「工作备忘录」、Web 资源已同步进 `android/app/src/main/assets/public/index.html`。
- ✅ 工程结构完整，含 Gradle wrapper（`gradlew` / `gradlew.bat`），可在有 Android 环境的机器上离线构建。
- ⚠️ 当前编辑机器**没有 Java (JDK) 也没有 Android SDK**，无法在此直接编译出 `.apk`。请你在装有 Android 构建环境的电脑上执行下面的构建命令即可得到安装包。

## 在你本机构建（需 Node / JDK 17+ / Android SDK）

```bash
cd WorkMemoApp
npm install            # 若 node_modules 不存在（如用的 WorkMemoApp.zip 解压包）
npx cap sync           # android/ 已生成，直接同步最新 web 与配置
npx cap build android  # 编译 debug 包
```

> `npx cap add android` 这步**已做过**，无需重复。若你自行删除了 `android/` 目录，再执行一次即可。

构建产物位置：
`android/app/build/outputs/apk/debug/app-debug.apk`

也可用 Android Studio 打开构建：
```bash
npx cap open android
```
Studio 内：**Build → Build Bundle(s) / APK(s) → Build APK(s)**。

## 环境变量（构建前请确认）

- `JAVA_HOME` 指向 JDK 17+ 安装目录
- `ANDROID_HOME`（或 `ANDROID_SDK_ROOT`）指向 Android SDK 目录
- 已通过 SDK Manager 安装：
  - Android SDK Platform 34（与 `variables.gradle` 中 `minSdkVersion` 对应）
  - Android SDK Build-Tools
  - Android SDK Platform-Tools（含 `adb`）
- 已接受 license：`sdkmanager --licenses`

## 工程说明

- `www/index.html`：来自设计稿生成、并经多轮迭代的可交互单文件 App（本地 localStorage 持久化、文件夹/计划/复盘、日历切换年月、搜索、统计、导出、提醒等）。
- `capacitor.config.json`：`appId=com.workmemo.app`，`appName=工作备忘录`，`webDir=www`。
- `android/`：Capacitor 生成的原生工程，包名/显示名已修正。
- 图标：位于 `android/app/src/main/res/mipmap-*`（默认 Capacitor 图标），可替换为品牌图标（建议 48/72/96/144/192 各档 png，以及 `mipmap-anydpi` 的 adaptive icon）。

## 自定义

- 改应用名 / 包名：编辑 `capacitor.config.json` 的 `appName` / `appId`，再 `npx cap sync`（会重写 `android/app/build.gradle` 的 namespace/applicationId 与 `strings.xml` 的包名/显示名）。
- 改启动页、状态栏颜色等：编辑 `android/app/src/main/res/values/`。
