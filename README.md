# WorkMemo · 工作计划与复盘备忘录

> 一个面向个人与团队的工作计划 / 复盘记录 App：单文件 HTML 内核 + Capacitor 封装的 Android 应用，数据本地存储（IndexedDB），支持图文混排、自定义文字颜色、定时提醒与后台通知。

- 包名：`com.workmemo.app`
- 当前版本：**v1.6.2**（versionCode 9）
- 平台：Android（Capacitor 7.x 封装）

---

## 一、项目概览

WorkMemo 帮助用户把「计划」和「复盘」两类记录沉淀下来，形成可回溯的工作档案：

- **计划（Plan）**：设定目标、日期与提醒时间，到点由系统通知提醒。
- **复盘（Review）**：事后记录成果与得失，支持多张配图。
- 所有数据**全部保存在本地**（IndexedDB + 跨会话草稿），不依赖任何云服务或账号。

产品需求文档见 [`PRD.md`](./PRD.md)（及可视化的 [`PRD-工作计划与复盘备忘录App.html`](./PRD-工作计划与复盘备忘录App.html)）。

### 核心功能（截至 v1.6.2）

| 能力 | 说明 |
|------|------|
| 双类型记录 | 计划 / 复盘，结构统一、可互相切换 |
| 单条多图 | 每条记录最多 9 张图片，宫格展示、逐张删除/替换、大图翻页浏览 |
| 正文富排版 | 醒目卡片式编辑区 + 「请输入文本」占位提示；保留段落与换行 |
| 自定义文字颜色 | 预设色 + 自由取色器，自动计算文字阴影以保证在照片背景上的可读性 |
| 定时提醒 | 本地通知提醒计划时间；切回前台自动重登记，防被系统清理漏提醒 |
| 图片本地去重 | 按内容 SHA-256 去重，跨笔记共用同一份 Blob，节省空间 |
| 导入 / 导出 | 支持 JSON 导出与历史数据迁移 |

---

## 二、技术栈

| 层 | 技术 |
|----|------|
| 应用内核 | 单文件 `work-memo-app.html`（内联 `<script type="module">` + 经典脚本） |
| 逻辑模块 | `src/*.js`（ES Module，纯函数为主，便于单测） |
| 本地存储 | IndexedDB（`notes` / `contents` / `note_images` 三表，图片按哈希去重） |
| 原生封装 | Capacitor 7.x（Android）；`@capacitor/local-notifications` 用于定时通知 |
| 构建 | Gradle `assembleDebug`（Android Debug APK） |
| 测试 | Node 22 `node --test`，含纯函数行为断言 + 对 HTML/JS 源码的正则静态断言 |

> 内核刻意做成**单文件 HTML**，便于在桌面浏览器直接打开调试，也便于作为 Capacitor `assets` 直接打包进 APK。

---

## 三、目录结构

```
.
├── work-memo-app.html              # ★ 应用唯一内核（真源），桌面可直接打开
├── src/                            # ES Module 逻辑模块（app-core / note-db / sidebar / sound / lz-string）
├── tests/                         # node --test 测试（*.test.js，45 个文件）
├── WorkMemoApp/
│   ├── www/index.html             # 镜像①：Web 产物（与根目录内核一致）
│   └── android/
│       ├── app/build.gradle      # versionCode / versionName / 依赖
│       └── app/src/main/assets/public/
│           ├── index.html         # 镜像②：打包进 APK 的资源（.gitignore 忽略，发版前由脚本同步）
│           └── src/*.js
├── PRD.md / PRD-工作计划与复盘备忘录App.html  # 产品需求文档（两版）
├── RELEASE_NOTES_v1.6.2.md        # 最近一次发版说明
└── workmemo-app-debug-v1.6.2.apk  # 最近一次构建产物（.gitignore 忽略，不入库）
```

### 三处镜像同步约定（重要）

`work-memo-app.html` + `src/*.js` 需要在以下三处保持**字节一致**：

1. 仓库根目录 `work-memo-app.html` / `src/`（真源）
2. `WorkMemoApp/www/index.html` / `WorkMemoApp/www/src/`（Web 构建输入）
3. `WorkMemoApp/android/app/src/main/assets/public/`（APK 资源，**被 `.gitignore` 忽略**，仅本地构建使用）

> 发版前必须执行同步并 `md5sum` 校验三处一致，否则 APK 内会跑旧代码。

---

## 四、构建与运行

### 前提

- Node 22+（用于测试）
- Android SDK（compileSdk 35 / minSdk 23）+ JDK 17（用于 Gradle 构建）
- Capacitor CLI 已初始化

### 构建 Debug APK

```bash
# 1. 同步镜像（根目录内核 → www → android assets/public）
cp work-memo-app.html WorkMemoApp/www/index.html
cp work-memo-app.html WorkMemoApp/android/app/src/main/assets/public/index.html
cp src/*.js WorkMemoApp/www/src/
cp src/*.js WorkMemoApp/android/app/src/main/assets/public/src/

# 2. 构建
cd WorkMemoApp/android && ./gradlew assembleDebug

# 产物：WorkMemoApp/android/app/build/outputs/apk/debug/app-debug.apk
```

### 桌面调试

直接用浏览器打开 `work-memo-app.html` 即可运行（IndexedDB 在桌面浏览器同样可用）。

---

## 五、测试

```bash
npm test          # 等价：node --test tests/*.test.js
```

- **纯函数行为测试**：直接 `import` `src/app-core.js` 等模块断言返回值。
- **静态断言测试**：对 `work-memo-app.html` 源码做正则切片断言（函数是否包含某逻辑、是否仍存在某已废弃写法）。
- 改了某实现方式后，需同步 `grep` 旧写法是否被其它测试锁死。

每次提交前都会对内核的内联模块脚本做 `node --check` 语法校验。

---

## 六、版本与发版

- 版本号在 `WorkMemoApp/android/app/build.gradle`：`versionCode` 递增、`versionName` 语义化。
- 发版流程：修复 → 加测 → 通过 → 提交 → 同步三处镜像 → 升版本号 → 构建 APK → 更新 PRD → 推送 → 创建 GitHub Release 并上传 APK。
- Release 与历史 APK 见 GitHub Releases：https://github.com/zhaober/work-me/releases

---

## 七、安全提示

- 创建 GitHub Release 使用 **classic PAT**，仅一次性通过环境变量 `GH_TOKEN` 注入，**不写入任何文件**；用后请到 GitHub → Settings → Developer settings → Personal access tokens 撤销。
- `*.apk` 与 `android/app/src/main/assets/public/` 均被 `.gitignore` 忽略，不会进入版本库。

---

## 八、相关文档

- 产品需求文档：[`PRD.md`](./PRD.md)
- 可视化 PRD：[`PRD-工作计划与复盘备忘录App.html`](./PRD-工作计划与复盘备忘录App.html)
- 最近发版说明：[`RELEASE_NOTES_v1.6.2.md`](./RELEASE_NOTES_v1.6.2.md)

## 九、许可证

本项目以 [MIT License](./LICENSE) 开源。
