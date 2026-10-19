# 架构 · CloverMoss Launcher

- 文档版本：v0.4（2026-10-19）
- 应用版本：`0.1.0`
- 完成度与验证边界：[status.md](status.md)
- 产品形态与交互：[product-design.md](product-design.md)

> 本文只描述**当前代码实际怎么工作**。最后一节单列“未实现/计划架构”，
> 不把 WebUI、签名、托管 Python 等未落地设计写成现状。

---

## 1. 范围与硬边界

CloverMoss Launcher 是 Electron 桌面编排器：

- 管理 MOSS-Image 的 git 版本、Python 运行时、模型/适配器、启动参数和进程；
- 自身**不实现**模型图、kernel、量化运行时、采样器；
- 推理通过外部 Python 进程（官方 Gradio 或薄 runner）执行；
- 训练通过外部 KohakuMossTrainer 执行，**不 vendor、不 submodule、不 import**；
- 渲染进程不直接使用 Node；系统能力全部经 preload + 类型化 IPC。

四条实现约束：

1. 主进程持有领域状态；渲染层是视图；
2. preload 只暴露白名单 invoke/on，不开 `nodeIntegration`；
3. 长时间运行的用户进程走 Supervisor（训练与推理共用同一 Job 表）；
4. 短命令（git、uv、nvidia-smi、doctor）走 `lib/run.ts`，不经过 Supervisor。

## 2. 进程与窗口模型

```
Electron Main (Node)
├── 领域服务（env / git / runtimes / instances / models / gallery /
│             supervisor / diagnostics / trainerGit / trainers / trainingHosts）
├── ipc.ts（ipcMain.handle + zod）
└── BrowserWindow × 4
    ├── launcher   /            1180×760
    ├── creator    /studio      1320×860
    ├── terminal   /terminal    1120×720
    └── trainer    /trainer     1280×840
         ↕ preload（contextBridge）
    React 19 renderer（同一 bundle；按 windowKind 分流）
```

- 四个窗口共用同一个 renderer bundle；`--clover-window=<kind>` 在 preload
  暴露 `windowKind`；
- `src/main/windows.ts` 负责创建/单例/聚焦/关闭；`window:open` 可打开指定
  kind 与 route；
- 启动器关闭不会主动关闭其它已打开窗口；所有窗口关闭后按平台退出；
- macOS：`hiddenInset` + `vibrancy: under-window`；
  Windows：`hidden` + `titleBarOverlay` + acrylic；Linux 默认；
- 截图模式使用不透明 `#191b1f`；普通桌面窗口启用亚克力。

**没有** WebUI server / Fastify / HTTP API；这部分是 M5 计划。

## 3. 代码结构

```
apps/desktop/
  electron.vite.config.ts
  src/main/
    index.ts             生命周期、smoke、scenario、screenshot
    windows.ts           四窗口
    ipc.ts               IPC handler + zod
    lib/                 paths / run / events
    services/            env / network / git / runtimes / instances / models /
                         updates / gallery / supervisor / parsers / diagnostics /
                         devices / cases / onboarding / trainerGit / trainers /
                         trainingHosts / remoteTrainer / ssh / launchQueue / trainerArtifacts
  src/preload/index.ts   contextBridge：invoke / on / windowKind / acrylic / channel
  src/renderer/
    src/App.tsx          按 windowKind 分流 shell
    src/pages/           Home / Studio / Gallery / Terminal / Training / TrainerWindow /
                         Instances / InstanceDetail / Models / Diagnostics / Settings
    src/components/      AppTitlebar / layout / NotificationPanel / Oobe / ui
    src/lib/             layout.ts / clover.ts / windows.ts / api / format / i18n
    src/store.ts         Zustand：env / instances / jobs / downloads / notifications / UI
  src/shared/            types / channels / zod schemas
runner/                  薄 Python runner（官方 pipeline + NDJSON + --simulate）
release/                 manifest / 公告 / 模型目录 / 错误规则
docs/                    产品、架构、状态、路线图、layout 规范、ADR
```

## 4. 领域服务

| 服务 | 职责 |
| --- | --- |
| `env.ts` | 系统/GPU/内存/磁盘/Python/git/uv/网络/端口探测，推荐档位 |
| `network.ts` | GitHub/PyPI/HF 镜像候选、探测、`applyGitMirror` |
| `settings.ts` | `settings.json` 读写、默认值、合并 |
| `git.ts` | MOSS bare mirror、分支/commit、worktree、dirty |
| `instances.ts` | `instance.json`、版本固定、运行时引用、删除/隔离 |
| `runtimes.ts` | 共享/独立 venv、依赖锁 hash、uv/pip 安装、状态 |
| `models.ts` | HF 兼容缓存、下载、Range 续传、LFS sha256、适配器 |
| `updates.ts` | manifest/公告检查；**不下载安装更新** |
| `gallery.ts` | outputs/自定义根、分页、元数据、`clover://` |
| `supervisor.ts` | 推理/训练 Job、spawn、日志、进度、readiness、取消 |
| `parsers.ts` | ANSI、`\r`/`\n` 分帧、tqdm、下载条、错误匹配 |
| `diagnostics.ts` | 诊断去重、toast 预算、解决动作、持久化 |
| `devices.ts` | Apple MPS / CUDA / CPU 枚举 |
| `cases.ts` | Case（启动配置）持久化 |
| `onboarding.ts` | OOBE 三行状态 |
| `trainerGit.ts` | trainer bare mirror、分支/commit、per-commit worktree |
| `trainers.ts` | TrainerVersion、lock hash venv、doctor、训练命令拼装 |
| `trainingHosts.ts` | local + SSH host 持久化、测试状态 |
| `ssh.ts` | 系统 OpenSSH 参数、host probe、scp |
| `remoteTrainer.ts` | 远端 mirror/worktree/venv/doctor/版本（fake ssh 验证） |
| `launchQueue.ts` | `launch-queue.json` 队列持久化/中断标记 |
| `trainerArtifacts.ts` | 训练产物收集与本地适配器登记 |

## 5. IPC 与安全

- `src/shared/channels.ts` 定义 `Ipc` 与 `Events`；
- `src/shared/schemas.ts` 用 zod 校验输入；`ipc.ts` 统一 `handle()`；
- preload 只暴露：
  - `invoke(channel, payload)`
  - `on(event, listener)`
  - `windowKind`
  - `acrylic`
  - `channel`（dev/release）
  - `platform` / `version`
- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`；
- `setWindowOpenHandler` 只允许 https 外开，禁止新 BrowserWindow；
- `will-navigate` 阻止应用内跳转外部地址；
- 当前开发 CSP 允许 `'unsafe-eval'`（Vite/开发需要），**打包前必须收紧**；
- SSH host 只存连接信息，不存密码；远端代码路径已接，真实 host 未验收。

## 6. 持久化与磁盘布局

实际使用 **JSON 文件 + 目录**：

```
<userData>/                     开发时 = .dev-data/
  settings.json                 设置
  cases.json                    Case 启动配置
  launch-queue.json             运行/排队行（重启语义）
  diagnostics.json              诊断历史
  training-hosts.json           local + SSH host
  announcements.json            公告缓存（如使用）
  git/
    moss-image.git/             MOSS bare mirror
  instances/<id>/
    instance.json
    <worktree files>
    outputs/
  runtimes/<id>/
    runtime.json
    bin/ lib/ ...
  models/
    hf/hub/models--.../         HF 兼容缓存
    adapters/<id>/              适配器
    adapters/index.json         本地训练产物登记
  downloads/
  jobs/
    jobs.json                   最近 Job 记录（最多 60）
    <jobId>.json / .jsonl
  trainer/
    git/kohaku-trainer.git/
    versions/<id>/              per-commit worktree + trainer.json
    runtimes/<id>/              trainer venv + runtime.json
  outputs/                      应用级输出
  logs/
```

- 所有路径由 `lib/paths.ts` 统一生成；开发环境通过
  `app.setPath('userData', .dev-data)`；
- 实例/训练版本永远使用**完整 SHA**；短 hash 只做展示；
- Job 重启时 running/starting 会被标为 `failed`（“应用重启，任务已中断”）；
  `launch-queue.json` 的 queued 行保留，启动器会尝试重排。

## 7. 核心数据模型

主要定义在 `src/shared/types.ts`：

| 类型 | 关键字段 |
| --- | --- |
| `Settings` | networkMode/gitMirror/pipIndex/hfEndpoint/modelsRoot/galleryRoots/homeBackground/trainerRoot |
| `InstanceInfo` | id/name/commit/runtimeId/models/adapters/status |
| `RuntimeInfo` | id/python/lockHash/deps/state |
| `ModelEntry` | repo/revision/role/size/installed |
| `AdapterEntry` | repo/kind/base/files/installed |
| `LaunchCase` | instanceId/backend/deviceId/profile/port/extraArgs |
| `JobRecord` | id/instanceId/kind/mode/state/stage/progress/metrics/hostId/trainerVersionId/trainerRunName/error/logPath |
| `TrainerVersion` | commit/branch/path/runtimeId/runtimeState/channel/dirty/status |
| `TrainingHost` | id/kind/host/user/port/identityFile/trainerRoot/status/remote/versions |
| `Diagnostic` | ruleId/severity/title/explain/solutions/raw/signature |

`JobRecord.kind` 当前为 `inference | training`；训练 Job 额外有
`metrics.step/loss/lr/gradNorm`。

## 8. 实例与运行时

### 8.1 实例

1. 确保 MOSS bare mirror 存在；
2. 从 commit 创建 worktree 到 `instances/<id>/`；
3. 写 `instance.json`；
4. 实例引用一个 runtime、一个模型选择与启动档位；
5. dirty 检测排除 `instance.json` 与 `outputs/`；
6. 删除实例保留 outputs；运行时按引用清理。

MOSS-Image 没有 tag：稳定版 = `main` 分支 HEAD 或 manifest 的
`recommended_commit`。

### 8.2 运行时

- 依赖来自实例 `pyproject.toml`/`requirements`（`parseDepsFromPyproject`）；
- lockHash = Python 版本 + 平台/架构 + 依赖集合；
- 同 hash 复用 venv；实例可“独立”复制同 hash 的新 venv；
- 安装优先 uv，其次 pip；状态写入 `runtime.json`；
- 托管 Python（python-build-standalone）**未接**，当前用系统 Python。

## 9. 模型与下载

- 按 HuggingFace 目录布局写 `models/hf/hub`，让官方代码不 patch 也能命中；
- 文件清单来自 HF tree API；大文件走 LFS oid（sha256）；
- `Range` 续传、暂停/继续、3 并发/仓库、5 全局；
- 磁盘保护：所需空间 × 1.1 + 2 GB；
- 适配器按目录 ID 存到 `models/adapters/<id>`；
- 目录数据来自 `release/models.json`，失败时回退内置目录；
- 真实 27 GB 权重未在本机下载/验收。

## 10. 画廊、协议与背景

- 画廊根：应用 outputs、实例 outputs、settings.galleryRoots；
- 扫描深度 ≤ 5，跳过隐藏目录、`node_modules`、`.git`；
- `gallery:list` cursor + limit（默认 48），渲染层自动加载下一页；
- 卡片 `content-visibility: auto`，图片 lazy；
- `clover://local?path=…` 只允许画廊根与 `homeBackground`；
- 支持 PNG 元数据 + sidecar JSON；
- “用作布局底图”写入 `studioBackground`，通过 `window:open` 聚焦创作窗口；
- 首页背景默认 `assets/home-background.webp`（16:9），
  `settings.homeBackground` 可替换，并以 `linear-gradient + url` 铺满所有页面。

## 11. Supervisor、解析与诊断

### 11.1 Job 生命周期

```
queued → starting → running → succeeded | failed | canceled
```

- `supervisor.ts` 维护 `jobs` / `logs` / `running` 三个 Map；
- 推理：`runner` / `gradio` / `simulate`；训练：`training`；
- Job 记录写 `jobs/jobs.json`，日志写 `jobs/<id>.jsonl`；
- 推理 readiness：NDJSON `ready` 或端口/正则；超时 180 s；
- 取消：先 stdin cancel / 进程组信号，5 s 后强杀；
- POSIX 用进程组 kill，Windows 用 `taskkill /T /F`；
- 退出码 0 的推理必须有结果，否则 `E_NO_RESULT`；
- 训练 Job 退出码 0 直接成功（不要求图片结果）。

### 11.2 训练 Job

- `startTrainingJob` 是 Supervisor 的训练分支：
  - Job kind=`training`，stage=`denoise`；
  - 解析 `step N ... loss=...` / `lr=...` 更新 metrics 与进度；
  - 日志、取消、退出状态与推理共用；
- 训练命令由 `trainers.ts` 生成 shell/bat 脚本：
  - 先 `kohakumoss-config new train ...`；
  - 再 `kogine run scripts/train/moss.py ...`，追加 `--set`；
  - data 动作运行 `scripts/data/*.py`；
- 训练 Job 出现在同一终端 Cases；`Terminal.tsx` 用 `kind` 区分。

### 11.3 解析与诊断

- ANSI 去除、`\r`/`\n` 分帧、tqdm、HF 下载条；
- 错误规则来自内置 + `release/rules.json`；
- 同一 signature 去重；5 分钟内 toast ≤ 3；
- 诊断写 `diagnostics.json`，可清空；
- 训练/推理错误都走同一诊断入口。

## 12. 启动器 Case、设备与队列

- `devices.ts` 自动枚举 MPS / CUDA / CPU；没有维护页；
- `cases.ts` 持久化 Case，不是每次 Job；
- 首页 `Home.tsx` 维护当前会话的运行/排队视图；
- 同设备默认只跑 1 个真实任务，其余 `queued`；
- 队列行持久化到 `launch-queue.json`；重启时 queued 保留，starting/running 标 failed；
- 官方 Gradio：`gradio_app.py --host 127.0.0.1 --port <free>`，
  可追加 extraArgs；匹配 `Running on local URL` 后显示 URL；真实权重未验收；
- Clover 后端：没有常驻进程/HTTP/WS，仅 UI 占位。

## 13. 训练器架构

### 13.1 版本

```
trainerRoot/
  git/kohaku-trainer.git        bare mirror
  versions/kohaku-<sha7>/       worktree + trainer.json
  runtimes/<lockHash>/          venv + runtime.json
```

- clone/fetch 使用与 MOSS 相同的镜像逻辑；
- 每个版本固定完整 commit；
- `trainer.json` 记录 branch/commit/channel/path/runtimeId/runtimeState/dirty；
- `dirty` 排除 `trainer.json`、runs、outputs、user config；
- 删除版本时，只有没有其他版本引用时才删除共享 runtime。

### 13.2 环境

- 依赖来自 trainer 自己的 pyproject；
- lockHash = Python 版本 + 平台/架构 + 依赖；
- `uv venv`（无 uv 则 `python -m venv`）；
- 安装：`uv pip install --python <venv> -e <version>`；
- `kohakumoss-doctor` 通过 venv 内 console script 执行；
- **未在本机 CUDA 环境验证安装结果**。

### 13.3 本机训练

`startTrainerRun`：

1. 拒绝 macOS；
2. 检查 `nvidia-smi`；
3. 检查版本/runtime/console scripts；
4. 生成 `.clover-<action>.sh` / `.cmd`；
5. `startTrainingJob` spawn，日志/指标进共享 Job 表；
6. 导出/采样当前只返回可复制命令，不执行。

### 13.4 SSH

- host 配置持久化到 `training-hosts.json`；
- 系统 OpenSSH + 密钥/agent + `StrictHostKeyChecking=yes` + `BatchMode=yes`；
- host probe 读取 uname / nvidia-smi / git / uv / python / root；
- 远端 mirror、worktree、版本、venv、doctor、train/export 命令已接；
- 远端训练通过本地 `ssh` 子进程进入同一 Job 表；取消时再发一条 ssh kill PID；
- **仅在 fake ssh 下验证**；真实 host、host key、远端权限/网络未验收。

## 14. UI 壳与主题

- `App.tsx` 按 `windowKind` 分流：LauncherShell / Creator / Terminal / Trainer；
- 启动器 shell：`AppTitlebar` + `layout` 侧栏 + 路由内容；
- 标题栏 44 px，居中应用名 + `dev/release` + 版本；无侧栏 Logo；
- 训练窗口标题栏使用 `Kohaku Trainer` + `external`；
- `.glass-thin` 用于标题栏/侧栏，`.content-surface` 用于内容，`.glass` 卡片；
- 只保留深色：`nativeTheme.themeSource = 'dark'`；
- 背景以 inline style 同时给启动器 main、Creator、Terminal、Trainer；
- 通知是右上角单矩形，默认展开。

## 15. 开发与验证

```bash
pnpm install
pnpm build
pnpm typecheck

env -u ELECTRON_RUN_AS_NODE \
  pnpm --filter @clover/desktop exec electron . --smoke
```

可用场景（`src/main/index.ts`）：

| 场景 | 作用 |
| --- | --- |
| `--screenshot` | 启动器各路由 + 创作 + 终端 + 训练窗口截图 |
| `--scenario=create` / `second` / `install` | 实例/共享 runtime/依赖 |
| `--scenario=job` / `job-cancel` | 模拟推理、取消 |
| `--scenario=parser` | tqdm/OOM/缺包解析 |
| `--scenario=job-real` | 缺权重预检 |
| `--scenario=windows` | 通过 IPC 打开创作/终端窗口 |
| `--scenario=trainer-deploy` | trainer clone + worktree |
| `--scenario=trainer-job` | 模拟训练 Job + step/loss |
| `--scenario=trainer-host` | SSH host 保存/读取/删除 |
| `--scenario=trainer-host-probe` | fake ssh 下检查 os/git/uv/python/root |
| `--scenario=trainer-remote-local` | fake ssh 下远端 mirror/worktree |
| `--scenario=trainer-remote-env` | fake uv 下远端 venv/doctor |
| `--scenario=trainer-remote-job` | fake ssh 下远端训练 step/loss |
| `--scenario=trainer-remote-artifact` | fake ssh 下导出并登记适配器 |
| `--scenario=queue-persist` | queued 行落盘/读取/删除 |

测试现状：**没有** vitest/playwright 套件；验证以 typecheck/build、smoke、
scenario 和截图为主。parser 的单元测试/契约测试是后续计划。

## 16. 未实现 / 计划架构

以下**都不是现状**：

| 计划 | 说明 |
| --- | --- |
| WebUI | Fastify/SSE、token、局域网；复用服务层；未实现 |
| 托管 Python | python-build-standalone 下载/校验未接 |
| 更新安装 | 只检查 manifest/公告，不下载/验签/安装 |
| SSH 远端训练验证 | 真实 host 的 host key/权限/网络、远端 venv/Job 验收 |
| 导出/采样执行 | 只有命令预览 |
| Project / 图层 | 画布/草稿只存在内存 |
| Clover 常驻后端 | 没有 HTTP/WS 服务；创作生成未接 |
| 队列完整重启验收 | 已有 `launch-queue.json`，但自动重排/重启行为未验收 |
| 设备维护/并发配额 | 未做 |
| 打包/公证 | 未做 |
| V2 推理引擎 | 见 [future-inference-engine.md](future-inference-engine.md) |

## 17. 版本映射

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| M1 | Electron 壳、环境报告 | ✅ macOS 实测 |
| M2 | git 镜像、实例、运行时 | ✅ 基础；版本切换 UI 已接；托管 Python 未 |
| M3 | 模型/适配器、下载 | ✅ 基础；绑定 UI/大文件未验收 |
| M4 | Supervisor、runner、解析、诊断、画廊 | ✅ 基础；真实权重未验收 |
| UI v0.2 | 亚克力、侧栏、通知、画廊、创作台 | ✅ |
| UI v0.3（历史阶段） | 三窗口、启动条/运行栈、OOBE、终端 | ✅（已扩展为四窗口） |
| UI v0.4 | 四窗口、全局背景、训练页/训练窗口 | ✅ |
| Trainer v0.4 | 外部 trainer 部署/版本/环境/训练 Job/远端代码 | ✅ 基础；真实 CUDA/环境安装/真实 host 未验收 |
| M5 | WebUI、更新安装 | ⬜ |
| M6 | 打包、公证、Windows | ⬜ |
