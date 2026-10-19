# 架构文档 · CloverMoss Launcher

- 版本：v0.4（2026-10-19）
- 状态：三窗口 UI + M1–M4 基础已落地；实现差异与验收边界见 [status.md](status.md)
- 关联：[产品设计](product-design.md) · [ADR-0003](decisions/0003-launcher-first.md)

---

## 1. 范围与原则

V1 是**编排器**：Electron 壳 + 领域服务 + 外部 Python 运行时。没有推理代码、没有模型图。

四条硬边界：

1. **渲染进程不碰 Node**：所有系统能力经 `contextBridge` 的类型化 IPC；
2. **服务层可脱离 Electron 运行**：同一套服务同时服务桌面 IPC 与 WebUI HTTP；
3. **外部程序只经进程边界**：不 import 用户的 Python，不执行仓库里的任意脚本；
4. **一切自动决策可解释、可回滚**：换源、复用运行时、降档都写入事件与日志。

## 2. 进程模型

```
┌────────────────────────────────────────────────────────────────────┐
│ Electron Main (Node)                                               │
│  lifecycle · window · tray · menu · updater                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ core services（纯 Node，可单独测试）                          │  │
│  │ env · network · git · runtimes · instances · models ·        │  │
│  │ gallery · downloads · supervisor · parsers · diagnostics ·   │  │
│  │ updates · webui                                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│        │ ipcMain.handle / webContents.send        │ Fastify(可选)  │
│  ┌─────▼──────────────┐                    ┌───────▼───────────┐   │
│  │ Preload (sandbox)  │                    │ WebUI server      │   │
│  │ contextBridge API  │                    │ static + /api+SSE │   │
│  └─────┬──────────────┘                    └───────┬───────────┘   │
│  ┌─────▼──────────────────────────────────────────▼───────────┐   │
│  │ Renderer (React 19 + TS + Tailwind 4 + Apps SDK UI)        │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────┬────────────────────────────────────────────────────┘
                │ spawn（无 shell）
     ┌──────────┼───────────┬──────────────┬──────────────┐
     ▼          ▼           ▼              ▼              ▼
   git       python      uv/pip       runner.py      gradio_app.py
 (mirror)  (managed)    (install)     (NDJSON)        (HTTP 7860)
```

- 主进程持有全部状态；渲染进程是纯视图 + 乐观更新；
- WebUI 模式复用同一服务层，只是把 IPC 换成 HTTP/SSE；
- 子进程统一经 `supervisor`，禁止业务代码直接 `child_process.spawn`。

### 2.1 三窗口

```
LauncherWindow  首页（启动条 + 运行栈）/ 实例 / 模型 / 诊断 / 设置 / OOBE
CreatorWindow   Studio / 画布 / layout JSON / 画廊
TerminalWindow  Case 列表 + xterm（stdout/stderr/stdin）
TrainerWindow   Kohaku Trainer 外部：配置/命令预览/doctor/训练运行
```

- 同一套 renderer bundle，preload 通过 `--clover-window=<kind>` 暴露 `windowKind`；
- `src/main/windows.ts` 负责创建/单例/聚焦；标题栏统一居中 `CloverMoss` + `dev/release` + 版本；
- 启动器关闭不结束终端/创作；`window-all-closed` 按平台处理；
- 后续 WebUI 复用同一批 `/studio`、`/gallery` 路由。

## 3. 代码结构（monorepo）

```
apps/desktop/
  electron.vite.config.ts
  src/main/           Electron 主进程 + 领域服务 + IPC
    services/         env / network / git / runtimes / instances / models / updates / gallery /
                      supervisor / parsers / diagnostics / devices / cases / onboarding /
                      trainerGit / trainers
    windows.ts        启动器 / 创作 / 终端三窗口
    lib/              paths / run / events
  src/preload/        contextBridge（只暴露 invoke / on / acrylic）
  src/renderer/       React 19 + Tailwind 4 + Apps SDK UI
    src/pages/        Home / Studio / Gallery / Terminal / Training / TrainerWindow / Diagnostics / Instances / InstanceDetail / Models / Settings
    src/components/   AppTitlebar / layout / NotificationPanel / Oobe / ui / ErrorBoundary
    src/lib/          layout.ts（官方 layout 编译器）/ clover.ts / api / format / i18n
    src/store.ts      Zustand（含通知、创作草稿、画廊底图）
  src/shared/         types / channels / zod schemas
runner/               薄 Python runner（官方 pipeline + NDJSON + --simulate）
release/              manifest.json + 公告 markdown + 模型目录 + 错误规则
contracts/            协议与 schema（release / runner / job）
docs/  tools/         设计与预算工具
```

> M1–M3 采用单包（`apps/desktop`）。M5 做 WebUI 时把 `src/renderer` 抽到
> `apps/renderer`、把服务层抽到 `packages/core`，让桌面与 Web 共用；现在不提前拆，
> 避免 workspace 解析和构建复杂度拖慢首个可运行版本。

工具链：`pnpm` workspace、TypeScript strict、`electron-vite`、`vitest`、`playwright`、
ESLint + Prettier、`zod` 运行时校验。

## 4. 领域模型

```ts
Instance  { id, name, sourceUrl, branch, commit, channel, runtimeId,
            launch, models{dit,te,vae}, adapters[], status, createdAt, lastUsedAt }
GalleryItem { id, path, name, root, size, mtime, width, height, prompt, seed }
AppNotification { tone, title, message, createdAt, read }
Runtime   { id, pythonPath, pythonVersion, lockHash, kind: 'shared'|'isolated',
            path, state, refCount }
ModelPack { id, provider: 'hf'|'modelscope'|'url', repo, revision, role,
            files[], size, sha256, license, path, metadata }
Adapter   { id, name, kind: 'lora'|'lycoris'|'dmd', base, sha256, path, meta }
Download  { id, url, dest, total, received, sha256, state, speed, error }
Job       { id, instanceId, kind: 'generate'|'install'|'update', state, params, result }
Diagnostic{ id, jobId, ruleId, severity, title, signature, count, payload }
Announcement { id, level, title, body, startsAt, endsAt, dismissedAt }
```

**当前实现（M1–M3）**：JSON 文件——`settings.json`、`instances/<id>/instance.json`、
> `runtimes/<id>/runtime.json`；下载队列只在内存。

**M4 计划**：SQLite（`better-sqlite3`，WAL）表 `instances`、`runtimes`、`models`、
`instance_models`、`adapters`、`downloads`、`jobs`、`logs`、`diagnostics`、`settings`、
`schema_migrations`。选它的理由是同步 API 简化主进程事务；CI 用 prebuild +
electron-rebuild，备选 `node:sqlite`。

## 5. 磁盘布局

```
<appData>/CloverMoss/            macOS: ~/Library/Application Support/CloverMoss
                                 Windows: %APPDATA%\CloverMoss
  config.json                   用户设置（含敏感项仅存引用）
  state.db                      SQLite
  git/moss-image.git/           bare 镜像（~85 MB）
  instances/<id>/               git worktree + instance.json + outputs/
  runtimes/
    python/<version>/           托管 Python（python-build-standalone）
    <py>-<platform>-<lock>/     venv（shared 或 isolated）
  models/
    hf/hub/models--org--name/   HF 兼容缓存（blobs/snapshots/refs）
    adapters/<sha256>.safetensors
  outputs/                     首页/画廊默认读取的输出目录
  downloads/                    *.part（断点续传）
  logs/<job>.jsonl
  cache/
    env-report.json
    release/manifest.json       ETag 缓存
    thumbnails/
```

所有路径可迁移：设置里改根目录，启动时校验并更新记录中的相对路径。

开发模式把 `<appData>` 换成仓库内 `.dev-data/`，避免测试污染真实用户目录；
`ELECTRON_RUN_AS_NODE=1` 的 CI 环境需要启动前临时去掉该变量。

## 6. Git 与实例生命周期

### 6.1 镜像

```bash
git clone --bare https://github.com/OpenMOSS/MOSS-Image.git git/moss-image.git
git -C git/moss-image.git fetch --prune origin '+refs/heads/*:refs/heads/*'
```

- 只保留一个 bare 仓库；默认完整克隆（85 MB）保证离线可回滚；
- 可选 `--filter=blob:none` 加速首次克隆，但 checkout 需要网络，默认不开；
- 分支列表：`git for-each-ref --format='%(refname:short)%x1f%(objectname)' refs/heads`；
- 提交列表：`git log -n 100 --format='%H%x1f%h%x1f%ct%x1f%s%x1f%an' <branch>`。

### 6.2 实例 = worktree + pin

```bash
git -C git/moss-image.git worktree add --detach instances/<id> <sha>
```

- worktree 共享对象库，单个实例只多占 ~100 MB（assets）；
- `instance.json` 记录完整 SHA、分支、运行时、模型/适配器、启动参数；
- `dirty` 通过 `git status --porcelain` 计算；有改动时更新需确认（可导出 patch）；
- 删除：先删 DB 记录，再 `git worktree remove --force`，输出目录可选保留；
- 回滚：直接把 pin 切到旧 SHA（对象仍在），无需重新下载。

### 6.3 稳定版标记

- `main` HEAD 或 `release/manifest.json.sources.moss.recommended_commit` → **稳定版**；
- 其它 commit → **实验**；用户自填 fork → **自定义**；
- manifest 的推荐提交可在不发版的情况下推进，用于“我们验证过的版本”。

## 7. 运行时

### 7.1 解释器

优先级：用户指定 → 托管 Python → `uv python` → `pyenv` → `conda` → 系统
`python3 / py -3`。接受 3.10–3.13，推荐 3.12。

托管 Python：从 `astral-sh/python-build-standalone` 下载对应平台包，校验 sha256，
解压到 `runtimes/python/<version>/`；manifest 里固定版本与哈希（可运营更新）。

### 7.2 依赖安装（关键细节）

官方 `requirements.txt` 是 `-e .`。**不能把它装进共享 venv**：editable install 会把
`.pth` 指向某一个 worktree，实例一多就串。因此：

1. 从实例的 `pyproject.toml` 读 `[project].dependencies`（或 `requirements.txt` 中非
   `-e` 行）；
2. 用 `uv pip install`（无 uv 时 `python -m pip`）装依赖；
3. 运行脚本时 `cwd = instances/<id>`，Python 从当前目录 import `inference_runtime.py`
   等模块，不需要安装包本身。

torch 变体：

| 平台 | 来源 |
| --- | --- |
| macOS arm64 | PyPI 默认轮子（含 MPS） |
| Windows / Linux | 按驱动选 `cu126 / cu128 / cu130` 索引；无 NVIDIA 时 CPU 轮子 |

### 7.3 锁哈希与共享

```
lockHash = sha256(json({
  python, platform, arch, deps: sorted(requirements),
  torchIndex, resolver: "uv@<ver>", appRuntimeRevision: <n>
}))
```

- 同 hash 复用同一 venv；`runtimes.refCount` 由实例引用维护；
- 依赖变化 → 新 hash → 新 venv（旧实例不受影响）；
- “一键转独立”：用同 hash 新建带 uuid 的 venv，安装后切换实例引用；
- “修复”：`python -c "import torch, diffusers, transformers"` + `pip check`，
  失败则重建（保留旧目录以便回退）；
- GC：连续 30 天无引用且非默认运行时的 venv 可清理（用户确认）。

### 7.4 注入环境变量

```
PYTHONUNBUFFERED=1
PYTHONIOENCODING=utf-8
PYTORCH_ENABLE_MPS_FALLBACK=1        # macOS
TOKENIZERS_PARALLELISM=false
HF_HOME=<appData>/models/hf
HF_HUB_CACHE=<appData>/models/hf/hub
HF_HUB_ENABLE_HF_TRANSFER=1          # 若已安装
HF_ENDPOINT=<选中的镜像>
PIP_INDEX_URL / PIP_EXTRA_INDEX_URL / PIP_TRUSTED_HOST
```

另外注入 `CLOVER_JOB_ID`、`CLOVER_INSTANCE_ID`，供 runner 回传事件时带上。

## 8. 模型存储与下载

### 8.1 为什么写 HF 兼容缓存

官方代码直接用 `DiffusionPipeline.from_pretrained("OpenMOSS-Team/MOSS-Image-SFT")`，
只认 `HF_HOME` 下的缓存布局。我们不 patch 官方代码，而是**按 HF 布局落盘**：

```
models/hf/hub/models--OpenMOSS-Team--MOSS-Image-SFT/
  blobs/<etag>
  refs/main
  snapshots/<commit>/<file>  -> ../../blobs/<etag>
```

这样下载器可以自己控制队列、镜像、断点，而官方代码仍然命中缓存。

### 8.2 下载器

- 文件清单：`GET https://huggingface.co/api/models/{repo}/tree/{rev}?recursive=true`
  （含 `size`、`lfs.oid`）；
- 下载：`resolve/{rev}/{path}`，`Range` 续传，3 并发/仓库，5 全局；
- 校验：LFS 用 `oid`（sha256）；小文件校验 size + etag；
- 镜像：替换 host 为 `HF_ENDPOINT`（路径不变）；
- 暂停：`AbortController` + 保留 `.part`；恢复用 `Range: bytes=N-`；
- 磁盘保护：所需空间 × 1.1 + 2 GB，不足则暂停并解释；
- 失败：指数退避 3 次 → 切镜像 → 仍失败则诊断卡片（`E_NET`）。

### 8.3 适配器

单文件走 CAS：`models/adapters/<sha256>.safetensors`，DB 记元数据（名称、类型、基座、
触发词、来源、强度默认值）。相同文件只存一份，多实例共享。

### 8.4 注册表

内置目录 `release/models.json`（由 manifest 的 `catalog` 指向）可运营更新：
官方权重、社区量化包、DMD、常用 LoRA。每条含 `provider/repo/revision/files/license/
size/preview/tags`。用户也可“从 HF 仓库 / 链接 / 本地文件”添加。

### 8.5 画廊与本地图片协议

- **入口**：启动器侧栏的全局画廊，创作窗口也保留入口；
- **来源**：`<appData>/outputs`、每个实例的 `outputs/`、`settings.galleryRoots`（任意本地目录）；
- **扫描**：递归深度 ≤ 5，跳过隐藏目录与 `node_modules/.git`；结果按 mtime 倒序，
  5 s 内存缓存；
- **分页**：`gallery:list` 以 cursor + limit（默认 48）返回；渲染层用 IntersectionObserver
  自动加载下一页；
- **渲染优化**：卡片 `content-visibility: auto` + `contain-intrinsic-size`，图片 `loading="lazy"`，
  大目录不会一次性创建所有 DOM/解码所有图片；
- **本地图片**：注册 `clover://` 自定义协议，`clover://local?path=…` 只允许画廊根目录与
  `homeBackground`，主进程读文件后按 MIME 返回；CSP 只放行 `clover:`；
- **元数据**：PNG `tEXt/iTXt` + 同名 sidecar `.json`，读取 prompt / negative / seed / 尺寸；
- **交接**：详情里的“用作布局底图”写入 `studioBackground`，在启动器里通过 `window:open` 打开/聚焦创作窗口并跳到 `/studio`；
  跨窗口用 `localStorage` 短暂传递底图，创作窗口读取后清掉。
- **首页背景**：内置 `src/renderer/src/assets/home-background.webp`（16:9 深灰占位）；
  `settings.homeBackground` 可替换；`clover://` 协议允许精确匹配该路径。

## 9. 进程监督与适配器

### 9.1 接口

```ts
interface RuntimeAdapter {
  id: 'runner' | 'gradio'
  prepare(instance): Promise<PreparedLaunch>       // 命令、cwd、env、端口
  readiness: { event: 'ready'; timeoutMs: number } | { regex: RegExp }
  capabilities: { progress: 'ndjson'|'tqdm'|'none'; preview: boolean; stdin: boolean }
}
```

### 9.2 启动

```ts
spawn(python, args, {
  cwd: instanceDir,
  env: buildEnv(instance, network),
  detached: process.platform !== 'win32',
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
})
```

- **不使用 `shell: true`**，参数一律数组传递；
- POSIX 用进程组 kill（`process.kill(-pid)`）；Windows 用 `taskkill /PID <pid> /T /F`；
- 退出码：0 成功；130/3221225786 取消；137/9 被系统杀（按 OOM 处理）；
- 崩溃循环：10 min 内 3 次异常退出 → 停止自动重启并生成诊断。

### 9.3 Runner 协议

薄 runner（`runner/runner.py`，≤300 行）职责：

1. 读取 `--job job.json`（实例、模型、prompt、尺寸、步数、seed、适配器）；
2. 加载官方 pipeline（`diffusers` + `custom_pipeline`），一次性；
3. 逐步采样，按协议输出事件；
4. 写 PNG（内嵌元数据）到实例 `outputs/`；
5. 支持 stdin 取消。

事件用前缀行，避免与库日志混淆（详见 [runner-protocol.md](../contracts/runner-protocol.md)）：

```
@@CLOVER@@ {"type":"ready","protocol":1}
@@CLOVER@@ {"type":"stage","name":"denoise"}
@@CLOVER@@ {"type":"progress","stage":"denoise","current":5,"total":8,"percent":62.5,"eta_ms":18000}
@@CLOVER@@ {"type":"result","images":[{"path":"outputs/0001.png","seed":42}]}
```

非前缀行原样进控制台；同时按 tqdm 规则兜底解析（官方库仍会打进度条）。

### 9.4 Gradio 适配器

```bash
python gradio_app.py --host 127.0.0.1 --port <free> --model <local bundle>
```

- readiness：匹配 `Running on local URL: (http://\S+)` 或 TCP 探测；
- 生成进度由 Gradio 自己展示；启动器只显示“由 Gradio 提供”，并解析下载/报错；
- 展示：应用内 `WebContentsView` 或外部浏览器（用户可选）；
- 关闭：先请求停止，再按 §9.2 终止。

### 9.5 创作台与 layout 编译器

- 草稿：`abs + xyxy`，带 `width`/`height`，左上原点；
- 编译：每个 box 转为 `[floor(y1)-H/2, floor(x1)-W/2, ceil(y2)-H/2, ceil(x2)-W/2]`，
  输出 `bbox_coord_space: abs_centralized`、`bbox_format: yxyx`，去掉编辑器字段；
- 校验：16 倍数、区域非空、caption 非空、文字项必须有 `text`、bbox 在画布内；
- 对拍：与官方 `skills/moss-image-prompt-enhancer/scripts/compile_prompt.py` 的示例逐字段一致；
- 生成入口：M4 已接 `jobs:start`（Supervisor + runner）；真实权重生成待验收；
- 编译后的 JSON 直接插入 Prompt。

详见 [layout-schema.md](layout-schema.md)。

### 9.6 启动条、Case 与设备

- `devices.ts`：自动枚举 MPS / CUDA / CPU；暂不做维护页；
- `cases.ts`：`cases.json` 保存实例 + 后端 + 设备 + 档位 + 端口/参数；
- 启动条：`Case / 后端 / 实例 / 设备 / 档位 / 高级 / 启动`；运行后锁定为停止/终端；
- 队列：渲染层按设备维护，默认同设备 1 个真实任务；重启丢失（下一轮落盘）；
- 官方 Gradio：`gradio_app.py --host 127.0.0.1 --port <port>`，URL readiness；
- Clover 后端：占位，下一轮常驻 HTTP/WS。

### 9.7 当前实现（M4）

- `services/supervisor.ts`：`jobs:start/cancel/list/get/input/logs`、job.json、180 s readiness、
  stdin 取消 → 5 s 强杀、进程组 kill、JSON 持久化；
- `services/parsers.ts`：ANSI 剥离、`\r/\n` 分帧、tqdm/下载条、错误规则加载与 signature；
- `services/diagnostics.ts`：去重、全局 toast 预算（5 min ≤ 3）、`diagnostics.json` 持久化；
- `runner/runner.py`：官方 pipeline + NDJSON；`--simulate` 不加载权重，用于编排自检；
- 预检：运行时未就绪 / 27 GB SFT 权重缺失时直接生成诊断卡片，避免误触发下载；
- 未完成：SQLite、Gradio 实测、DMD 采样器、实例模型绑定。

## 10. 日志管线与错误规则

```
stdout/stderr bytes
  → UTF-8 解码（errors=replace）
  → ANSI 剥离（解析用）/ 保留（控制台显示）
  → 帧切分：\n 与 \r（tqdm 用 \r 原地刷新）
  → 规则匹配（有序）：
       1. runner NDJSON
       2. tqdm / HF 下载
       3. 错误模式
       4. 普通日志（级别推断）
  → 聚合与节流（进度 10 Hz，日志批量 100 ms）
  → 渲染进程 / SQLite / 日志文件
```

### 10.1 进度

```ts
type Progress = {
  key: string          // 进度条标识（前缀哈希），支持多 bar
  stage: 'load'|'text'|'denoise'|'decode'|'download'
  current: number; total: number; percent: number
  rate?: string; etaMs?: number; message?: string
}
```

tqdm 兼容正则（覆盖 `▌`, `█`, `?it/s`, `s/it`）：

```
^\s*(?<pct>\d{1,3})%\|.*?\|\s*(?<cur>\d+)/(?<total>\d+)\s*\[(?<elapsed>[^<\]]+)<(?<eta>[^,\]]+)(?:,\s*(?<rate>[^\]]+))?\]\s*$
```

下载条：`(?<name>.+?):\s*(?<pct>\d{1,3})%\|.*?\|\s*(?<cur>[\d.]+[KMG]?B?)/(?<total>[\d.]+[KMG]?B?)`。

- 主进度取 `denoise`；下载显示在侧栏；
- `current == total` 且收到下一阶段 → 标记完成，避免“卡在 99%”；
- 进度只升不降（除非切换 job）。

### 10.2 错误规则

规则是 JSON，可热更新（内置 + `release/rules.json` + 用户自定义）：

```json
{
  "id": "E_OOM_MPS",
  "match": "(MPS backend out of memory|OutOfMemoryError|CUDA out of memory)",
  "severity": "error",
  "title": "显存/内存不足",
  "explain": "模型在 {stage} 阶段耗尽了设备内存。",
  "solutions": [
    {"label": "降到 768² 重试", "action": "retry", "params": {"height": 768, "width": 768}},
    {"label": "启用分块解码", "action": "set_option", "params": {"vae_tiling": true}},
    {"label": "查看文档", "action": "open_url", "params": {"url": "..."}}
  ],
  "dedupe": {"windowSec": 60, "maxPerWindow": 1}
}
```

- `signature = sha1(ruleId + 归一化消息)`；归一化去掉路径、数字、地址；
- 卡片永久保留；toast 受全局预算（5 min ≤ 3 条）与单规则窗口约束；
- 规则可“静音 1 小时 / 永久忽略”；
- 未命中规则但进程异常退出 → `E_EXIT` 卡片，附 exit code 与最后 20 行；
- 首批规则覆盖：OOM、缺包、版本冲突、网络/SSL、磁盘满、权限、端口占用、HF 鉴权、
  模型损坏、MPS 不支持算子、被系统杀死。

## 11. 网络探测与镜像

- 探测点：GitHub（git/raw/api）、PyPI、HuggingFace、jsDelivr；
- 方法：`GET` 一个小文件，3 s 超时，两次取中位数；失败计惩罚；
- 缓存 10 min；启动、网络失败、用户点“重新检测”时刷新；
- 结果：每类服务一个有序候选列表，默认取第一名；
- 应用：
  - git：`-c url."<mirror>".insteadOf="https://github.com/"`；
  - pip：`PIP_INDEX_URL` + `PIP_EXTRA_INDEX_URL`（torch 索引）；
  - HF：`HF_ENDPOINT`；
- 镜像列表来自**签名的** `release/manifest.json`（可运营更新，不硬编码）；
- 手动覆盖优先于自动；失败自动回退并提示，不静默改用户全局配置。

## 12. 更新与公告

### 12.1 更新源

`release/manifest.json`（本仓库），经 jsDelivr → raw.githubusercontent → 代理 → 本地缓存
依次尝试，带 ETag；24 h 一次，启动时异步。

字段：`schema_version`、`app{channel,version,min_supported}`、`announcements[]`、
`assets[]`、`sources{git_mirrors,pip_indexes,hf_endpoints,manifest_mirrors}`、
`catalog{models_url}`、`signature`。

### 12.2 校验

1. JSON schema（zod）；
2. `signature`：Ed25519 对规范化 JSON（键排序、无空白）签名，公钥内置；
3. 版本：semver + 通道 + `min_supported`；
4. 资产：平台/架构匹配，下载后校验 sha256 再执行。

### 12.3 公告

- `announcements[]` 支持内联 `body_markdown` 或 `body_url`（如 `release/README.md`）；
- 首页卡片 + 公告页；按 id 记录已读/不再显示；
- markdown 经 sanitize（禁脚本/iframe，图片仅 https，外链确认）；
- 离线显示缓存并标注“上次检查时间”。

### 12.4 安装

- macOS：下载 dmg/zip → 校验 → 提示重启 → 替换并重启（Sparkle 风格）；
- Windows：NSIS 安装包，静默参数 + 重启；
- 失败回滚：保留上一版本，启动失败 3 次自动回退并提示；
- 大版本（major）不静默安装，必须用户确认。

## 13. WebUI

- Fastify 监听 `127.0.0.1:<随机>`；静态资源来自 `apps/renderer/dist`；
- `/api/*` 与 IPC 同构；`/events` SSE（断线重连 + Last-Event-ID）；
- 鉴权：启动时生成一次性 token，写入 `0600` 文件；URL `?token=` → HttpOnly cookie；
- 局域网：设置显式开启，绑定 `0.0.0.0`，显示二维码与警告；
- 限流：每 IP 10 req/s；上传/下载路径限制在数据根目录；
- 与桌面共用 `LauncherClient`，仅 transport 不同（IPC vs HTTP）。

## 14. IPC 与类型安全

```ts
// preload 暴露的唯一表面
window.clover = {
  invoke<T>(channel: Channel, payload: unknown): Promise<T>
  subscribe(channel: EventChannel, cb: (e: unknown) => void): () => void
}
```

- 每个 channel 在 `packages/contracts` 里用 zod 定义入参/出参；
- 主进程统一 `handle(channel, schema, fn)`，失败返回结构化 `{ok:false,error}`；
- 事件（进度、日志、下载、更新）单向推送，渲染层用 Zustand 归约；
- 禁止在渲染进程使用 `remote`、`shell.openPath` 等未包装能力。

## 15. 安全与威胁模型

| 威胁 | 缓解 |
| --- | --- |
| 恶意模型/实例仓库 | 只运行白名单入口（`gradio_app.py` / runner）；自定义源需二次确认；不执行安装脚本 |
| 更新被劫持 | HTTPS + Ed25519 签名 + sha256；镜像只从签名 manifest 取 |
| 本地 WebUI 被扫描 | 随机端口 + token + 仅 loopback；LAN 显式开启 + 限流 |
| 命令注入 | 全部数组参数，无 shell；路径 `path.resolve` 后校验前缀 |
| 路径穿越 | 所有用户输入路径规范化并限制在数据根目录；zip 解压校验（若支持导入包） |
| 令牌泄漏 | HF token 存 OS Keychain（`safeStorage`），日志脱敏 |
| 渲染进程 XSS | `contextIsolation`、`sandbox`、CSP、禁用 `nodeIntegration`；外链走系统浏览器 |

## 16. 跨平台

- **macOS**：arm64 优先；hardened runtime + 公证；`hiddenInset` + `vibrancy: under-window`；
  MPS fallback 环境变量；路径含空格需引号（spawn 数组天然安全）。
- **Windows**：`backgroundMaterial: 'acrylic'`（Win11）；长路径（worktree 可能 >260）；
  Defender 误报文档；`py -3` 启动器；`taskkill /T`；CRLF 归一化。
- **Linux**：XDG 路径；AppImage/deb；`python3` 多版本；无签名要求但保留校验。

## 17. 性能预算与可观测性

| 指标 | 预算 |
| --- | --- |
| 主窗口可见 | ≤ 1.5 s |
| 环境扫描 | ≤ 5 s（并行，单项 2 s 超时） |
| 实例列表 | ≤ 100 ms（本地 DB） |
| 空闲内存 | ≤ 250 MB |
| 日志渲染 | 5k 行/s 不卡顿（虚拟列表 + 批处理） |
| 进度更新 | ≤ 10 Hz/条，合并后推送 |
| 画廊 | 48 张/页；只渲染可视附近卡片；1 万张目录仍可滚动 |

- 结构化日志：主进程 `pino`，写入 `logs/app-<date>.jsonl`，30 天轮转；
- 任务日志：`jobs/<job>.jsonl`，含 stage/step/内存/降档/退出码；
- “导出诊断包”：环境报告 + 实例配置 + 最近日志 + 规则命中，脱敏后 zip。

## 18. 测试

- **单元**：parser（tqdm 变体、ANSI、OOM、pip 错误）、mirror 评分、semver、路径校验；
- **集成**：临时目录 + 假 git 仓库 + `fake_runtime.py`（可控输出进度/错误/等待 stdin）；
- **E2E**：Playwright + Electron，覆盖首次启动、创建实例、下载（MSW）、启动、错误卡片；
- **契约**：JSON schema 校验 `release/manifest.json`、`instance.json`、`job.json`；
- **模糊**：对 parser 输入随机字节，保证不崩溃、不吞日志。

## 19. 里程碑映射

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| M0 | 文档、契约、schema | ✅ 已完成（评审待补） |
| M1 | Electron 壳 + 首页 + 环境报告 | ✅ 已实现，macOS arm64 实测 |
| M2 | git 镜像 + 实例 + 运行时 | ✅ 基础完成；托管 Python / 更新 UI 待补 |
| M3 | 模型/适配器 + 下载队列 | ✅ 下载与 HF 缓存实测；绑定 UI 待补 |
| UI v0.2 | 亚克力/折叠侧栏/通知/画廊/创作台/标注器 | ✅ 已实现 |
| UI v0.3 | 三窗口 + 启动条/运行栈 + OOBE + 终端 + Fluent 深灰 | ✅ 已实现；Clover 后端下一轮 |
| M4 | Supervisor + runner + 解析 + 诊断 | ✅ 基础完成（simulate/取消/解析实测；真实权重待验收） |
| M5 | Gradio + WebUI + 更新/公告 | 计划 |
| Trainer v0.4 | Kohaku Trainer 外部窗口 / 版本 / 环境 / 配置预览 / 本机 CUDA 执行 | ✅ 基座；SSH/导出采样下一阶段 |
| M6 | 打包、公证、Windows、Beta | 计划 |
