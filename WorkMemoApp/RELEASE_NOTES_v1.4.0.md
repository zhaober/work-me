# 工作备忘录 v1.4.0（Debug）

存储架构整体重构：业务数据由 localStorage 迁至 IndexedDB，正文压缩入库，图片改为 WebP Blob 直存并全局去重。

## 核心变更

### 存储内核（F-26）
- 新建 IndexedDB 库 `work-memo-idb`（v1），含 `notes` / `note_contents` / `note_images` / `meta` 四张表
- 引入 lz-string，正文压缩为 `Uint8Array`（重复中文实测压缩到约 5%）
- 彻底告别 localStorage 约 5MB 配额限制；IndexedDB 不可用时自动降级，App 不白屏

### 正文分表（F-27）
- 正文与元数据拆到独立表 `note_contents`
- 原因：IndexedDB 游标一次取整行，同表内无法做到「列表查询不加载正文」，只有分表才能真正省内存

### 图片管线（F-28）
- 大图：长边 1080 → `toBlob('image/webp', 0.75)`
- 缩略图：200×200 居中裁剪 → `toBlob('image/webp', 0.65)`
- `crypto.subtle.digest('SHA-256')` 全局去重，命中则复用旧 ID、不再重复占空间
- Blob 直存，杜绝 Base64 入库（+33% 体积）；渲染走 `URL.createObjectURL` 并带缓存释放
- WebP 不支持回落 JPEG；`crypto.subtle` 不可用（file:// 非安全上下文）回落 FNV 指纹，去重不中断

### 写入策略（F-29）
- 防抖 3000ms 落盘，每次输入重置计时
- `visibilitychange` / `pagehide` / `beforeunload` 三类钩子强制立即落盘，切后台不丢数据
- 编辑已有记录自动存草稿；新建记录不自动入库，返回键 = 放弃改动

### 旧数据迁移（F-30）
- 启动时一次性把 localStorage 旧数据迁入 IndexedDB，旧 Base64 图片转 Blob 走新管线（压缩 + 去重）
- 靠 `meta.migratedFrom` 标记保证幂等；迁移后保留 localStorage 副本作回滚保险

## 质量

- 全量单元测试 **238 例通过**（含 12 例基于 fake-indexeddb 的真实 IndexedDB 集成测试）
- `npm test` 一键跑全量回归

## 已知局限

- IndexedDB 删除记录后不会自动归还磁盘空间（浏览器按源整体管理），需手动清除站点数据
- `crypto.subtle` 仅在 https / localhost 可用，`file://` 下去重回落 FNV 指纹
- 导出备份时图片以内联 Base64 写入导出文件（仅导出用，不入库），以保证换设备可还原

## 安装

Android 9+，下载 `workmemo-app-debug-v1.4.0.apk` 后允许「未知来源」安装即可。首次启动会自动迁移旧数据。
