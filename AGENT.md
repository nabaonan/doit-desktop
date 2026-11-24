# AGENT.md — doit-desktop 接手指南

本文件面向接手本项目的 AI / 开发者。目标是让接手者先理解分层边界、同步契约、数据口径和发布流程，再动手改代码。

用户视角说明见 [README.md](./README.md)；本文件是开发约束和高风险区域清单。

## 1. 项目定位

`doit-desktop` 是 `doit` 待办体系的桌面客户端：Vue 3 + TypeScript + Tauri 2。它通过 WebDAV 与手机端 `doit-apk`、GUI 端 `doit-gpui`、终端版 `doit-tui` 共享 `doit-backup.json`，遵循统一的 `SnapshotV2` wire 契约、墓碑语义、三方合并规则和分类色板。

四端仓库：

| 端 | 仓库 |
| --- | --- |
| 手机端 | `nabaonan/doit-apk` |
| 桌面端 | `nabaonan/doit-desktop`（本仓库） |
| GUI 端 | `nabaonan/doit-gpui` |
| 终端版 | `nabaonan/doit-tui` |
| 官网 | `nabaonan/doit-website` |

## 2. 技术栈与命令

- 前端：Vue 3.5 + TypeScript 5.9 + Vite 8 + Vue Router 4（hash history）+ Pinia 4
- UI：Reka UI（菜单 / 下拉 / ScrollArea / Tooltip）；Tailwind CSS 4 仅用于 `src/components/ui/`
- 图表：ECharts 6 + vue-echarts（统计路由懒加载）
- 桌面壳：Tauri 2.12，托盘、单实例、开机自启、窗口状态、更新插件
- Rust：reqwest 0.12（rustls-tls）、keyring 4.2
- 测试：Vitest 5 + jsdom + @vue/test-utils
- Node 要求：`^20.19.0 || >=22.12.0`，CI 用 Node 22

```bash
npm install
npm run dev            # 纯 Vite，IPC 走 localStorage 降级
npm run tauri dev      # 正常开发：HMR + Tauri 窗口
npm test               # vitest run，约 89 个用例
npm run test:watch
npm run typecheck      # vue-tsc --noEmit
npm run build          # typecheck + vite build，CI 门禁
npm run tauri build    # 当前平台安装包
```

注意：

- `verbatimModuleSyntax: true`，类型导入必须写 `import type`
- 裸 `tsc --noEmit` 不识别 `.vue`，必须用 `npm run typecheck`
- Chromium 降级模式覆盖不到真实事件 / 钥匙串 / 托盘行为；同步相关改动必须在 Tauri 窗口实测
- `src-tauri` 的 `cargo test` 目前不在 CI 中，Rust 改动需本地补跑

## 3. 分层边界（不可越界）

```text
src/domain/             纯领域逻辑，无 IO：types / snapshot / merge / color /
                        fingerprint / stats / taskTree / date / errors / seed
src/stores/             Pinia：tasks / sync / settings / ui
src/services/           ipc / persistence / webdav / update / echarts
src/components/doit/    业务组件：TopBar / StatusPills / TaskNode / Heatmap 等
src/components/ui/      Reka UI 封装
src/composables/        交互逻辑：长按完成 / 右键菜单 / 内联编辑 / 主题 / 快捷键
src-tauri/src/          只负责文件、网络、事件、系统能力；不做业务合并
```

**核心红线：Rust 侧只收发 `serde_json::Value`，不解析任务树、不实现任何业务合并规则。** 所有合并、完成判定、树规则都在 TypeScript `src/domain/`。

新增 IPC 命令要同时改：

1. `src-tauri/src/lib.rs` 的 `generate_handler!`
2. `src/services/ipc.ts` 的 `browserFallback`
3. `src/domain/errors.ts` 错误码与 `src-tauri/src/error.rs`

## 4. 数据契约

### 4.1 SnapshotV2

```ts
interface SnapshotV2 {
  version: 2
  revision: number
  exportedAt: number
  deviceId: string
  lastSyncAt: number | null
  categories: Category[]
  tasks: Task[]
}
interface Task {
  uid, parentUid, title, category, priority /* 0..4 */, done,
  completedAt, createdAt, updatedAt, deletedAt, depth, sortOrder
}
interface Category { name, color, sortOrder, updatedAt, deletedAt }
```

- `validateSnapshot()` 只做结构校验；字段补齐靠 `normalizeSnapshot()`
- `fromSnapshot()` 把扁平数组还原为带 `subs` 的树，孤儿节点提升为顶级
- `toSnapshot()` 是内存树 → 扁平 `tasks[]` 的唯一出口
- `fingerprint()` 只编码 tasks（按 uid 排序）+ categories（按 name 排序），忽略 revision / exportedAt / deviceId / lastSyncAt 与 UI 配置；用于判断是否需要 PUT

本地文件：`doit-backup.json`；基线：`sync-base.json`。浏览器降级使用 `localStorage`。

### 4.2 WebDAV 同步时序

1. `sync_now` 命令只 spawn 后台任务并立即返回 `{jobId}`，重复调用幂等
2. 后台：`PROPFIND` 探测 → `GET doit-backup.json`（404 = 无远端文件）→ 读 `sync-base.json`
3. 有远端时 emit `sync://progress { phase: 'merge-required', remote, base }`，并用 oneshot 等待前端（30s 超时）
4. 前端 `stores/sync.ts` 调 `merge3(local, remote, base)`，再调 `save_snapshot(merged)` 唤醒 Rust
5. Rust 读回主文件 → `PUT` → 写 `sync-base.json` → emit `sync://state = synced`

密码优先取 IPC 内存入参，否则按 `passwordRef` 从系统钥匙串读取。`danger_accept_invalid_certs` 默认 false；底层 `reqwest::Error` 的 Display 不得外传。

### 4.3 `merge3`（`src/domain/merge.ts`）

1. 按 uid（任务）/ name（分类）取并集
2. 仅本地相对 base 变 → 本地；仅远端变 → 远端
3. 两边都变且不同：`effectiveTime = max(updatedAt, completedAt, deletedAt, createdAt)`，较新者胜，**平局远程优先**
4. `isStaleRemote()`：`remote.exportedAt < local.exportedAt && remote.revision <= local.revision` 时直接本地胜并强制 PUT
5. 墓碑：删除后对方又有真实编辑才复活，否则取较新的 `deletedAt`
6. 分类墓碑：用可见字段（color / sortOrder）相对 base 的变化判断“真实编辑”，**绝不能用 `updatedAt`**（同步回写会污染它，导致已删分类复活）
7. 输出 `revision = max(L,R)+1`，`putRequired = fingerprint(merged) !== fingerprint(remote)`

### 4.4 颜色契约

```ts
DEFAULT_CATEGORY_COLOR = '#34C7A8'
CATEGORY_SWATCHES = [
  { value: '#34C7A8', name: '薄荷绿' }, { value: '#5AA9E6', name: '晴空蓝' },
  { value: '#F2A65A', name: '暖阳橙' }, { value: '#A78BFA', name: '薰衣草紫' },
  { value: '#22B8CF', name: '青碧色' }, { value: '#F08A8A', name: '珊瑚粉' },
  { value: '#AACB5E', name: '嫩芽绿' }, { value: '#7C96B0', name: '雾霭蓝' },
]
```

- `normalizeCategoryColor()`：trim → 补 `#` → 6 位 hex 校验 → 转大写 → 非法回退默认色
- 必须在三个时机调用：快照读入、编辑预填、写入
- `categoryTint()` 用 `rgba()`，不用 `color-mix(in srgb, ...)`（跨平台 WebView 兼容）
- 进度条默认色 `#3FBB9C` 与分类默认色不同，勿混改
- 改色板必须同步手机端 `Color.kt:PaletteColors`、gpui `task_tree.rs:CAT_PALETTE`、tui `theme.rs:CAT_PALETTE`

## 5. 状态与数据口径

### 5.1 顶栏同步状态

`sync.kind` 优先级：

```text
off → error → syncing → ready → dirty → synced
```

- `ready`：WebDAV 已开启但尚未验证过连接（`verified=false`）
- `dirty`：有未同步更改
- `synced`：已与远程同步
- `verified` 只在「测试连接成功」或「完成一次同步」时置位
- 同步胶囊可点击 / Enter 触发 `syncNow()`；右侧日期胶囊显示 `M月D日 周X` + 今日进度环，点击回 `/today`

### 5.2 今日与统计口径

- `showInToday()` 只算顶级非墓碑任务：`!done || completedAt` 与今天同一本地日
- 顶栏进度环恒用 `'all'` 口径，与分类筛选解耦
- `completedTop()` 只数区间内已完成的顶级非墓碑任务；week=7 / month=30 / year=365 天（含今天）
- `categoryShare()` 必须给全部分类补 0；已删分类若区间内仍有完成记录则保留
- `heatLevel` 阈值：`0 / ≤2 / ≤4 / ≤7 / >7`
- 时间全部按本地时区

### 5.3 响应式与编辑陷阱

- `index` 是 `shallowRef` 存原始对象；改动必须从 `root.value` 取响应式代理（`mutableNode()`），否则“数据已写、视图不刷新”
- 分类写入使用模块级 `commitCategories()` / `editCategory()`，为兼容 HMR 残留的旧 store 实例
- 删除一律 `deletedAt = now`，禁止物理删除
- 父任务完成态由 `recalcUp()` 按有效子任务推导；已完成不可回滚
- 分类写入时统一归一化颜色，避免历史值回显失败

## 6. 安全边界

- 密码只经 IPC 内存参数进入系统钥匙串，`passwordRef` 形如 `doit-webdav:<username>`
- TS `stripSensitive` 与 Rust 配置白名单双重保证：任何持久化对象不得出现 `password` / `token` / `secret` 等键
- 错误信息禁止带 URL userinfo、账号或底层网络 Display
- `Cargo.toml` 中的 `custom-protocol` feature 标注了 DO NOT REMOVE，勿删

## 7. 发版纪律

- **只有用户明确要求「发版 / 发布」时才能执行。** 日常改动只 `commit + push main`
- 当前版本 `0.1.9`，四处必须一致：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`
- `./release.sh [patch|minor|major|1.2.3] [--dry-run] [--force]`：`npm version` + Python 同步版本 → commit bump → tag → push tag
- **脚本只 push tag，不 push main**；发版后需要手动 `git push origin main`（README 中“tags 与 main 均推送”是旧描述）
- `v*` tag 触发 `.github/workflows/release.yml`：macOS universal、Windows NSIS、Linux deb，产物发布到 GitHub Release
- 无 `TAURI_PRIVATE_KEY` 时 CI 会临时去掉 `createUpdaterArtifacts` 出未签名包；设置页「检查更新」实际走 GitHub Releases API，不依赖签名 updater
- 发版前先 `--dry-run`；发版后核对 tag、版本文件和 Release 产物

## 8. 接手红线清单

1. Rust 不写业务规则，TS domain 是唯一权威
2. 墓碑删除不可改回物理删除；分类墓碑判定不能用 `updatedAt`
3. 合并语义中的平局远程优先、陈旧远端短路、`fingerprint` 幂等均为历史修复点
4. 色板四端同步，颜色带 `#` 大写；`rgba()` 替代 `color-mix`
5. 顶栏状态与今日口径不要混入分类筛选
6. 凭据只走钥匙串，错误信息必须脱敏
7. 改完先 `npm test && npm run typecheck`；同步 / 钥匙串 / 托盘改动必须实测 Tauri 窗口
8. 文档与代码同步更新，避免 README 中出现过期版本号或测试数量
