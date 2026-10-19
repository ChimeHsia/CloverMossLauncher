# 产品设计 · CloverMoss Launcher

- 文档版本：v0.4（2026-10-19）
- 应用版本：`0.1.0`（开发版）
- 当前实现边界：见 [status.md](status.md)
- 技术实现：见 [architecture.md](architecture.md)

> 本文描述**当前产品形态**与已经确认的设计约束。未来能力统一放在 §13，
> 不混入“现在能做什么”。

---

## 1. 一句话

**像 Minecraft 启动器一样管理 MOSS-Image，并给创作、终端和训练各一个独立窗口。**

启动器负责“装得上、分得清、跑得起来、出错能修”；它本身不是推理引擎，
也不是训练内核。推理通过官方 Python runtime / 薄 runner 执行，
训练通过外部的 KohakuMossTrainer 执行。

## 2. 定位

### 2.1 做什么

- 环境体检与推荐档位；
- MOSS-Image 实例（git commit + 运行时 + 模型/适配器）管理；
- 共享/独立 Python 运行时与依赖安装；
- 模型/适配器目录、HF 兼容下载、断点续传；
- 启动栈、Case、设备、队列与运行监督；
- 日志解析、错误诊断、通知；
- 画廊与背景；
- 外部 Kohaku Trainer 的部署、版本、环境、训练配置与运行；
- 终端中同时查看推理和训练任务。

### 2.2 不做什么

- 不做自研推理引擎（V1）；模型图/量化/kernel 不在本仓库；
- 不 vendor、不 submodule、不打包 KohakuMossTrainer 代码；
- 不重新实现训练器；训练窗口只管理外部 trainer 与命令；
- 不做账号、云同步、模型市场后端、遥测；
- 不做 img2img/edit（官方尚无对应能力）。

## 3. 术语

| 术语 | 定义 | 不是什么 |
| --- | --- | --- |
| **Instance 实例** | 绑定到某个 MOSS-Image git commit 的 worktree + 运行时引用 + 模型选择 | 不是一次生成任务 |
| **Case** | 一次可复用的启动配置：实例 + 后端 + 设备 + 档位 + 端口/参数 | 不是 Project，也不是 Job |
| **Project** | 未来的创作文档：画布、图层、资产、提示词（**未实现**） | 不是 Case |
| **Job** | 一次进程运行：推理或训练；有 state/progress/log | 不是 Case |
| **Runtime** | Python 解释器 + 依赖集合；按 Python 版本 + 依赖锁 + 平台/加速器共享 | 不是模型 |
| **TrainerVersion** | Kohaku trainer 的某个 commit 的 worktree + 独立运行时 | 不是推理 Instance |
| **TrainingHost** | 训练主机配置：local 或 SSH（host/user/port/identityFile/trainerRoot） | 远端代码路径已接，真实 host 未验收 |
| **Model Pack** | DiT / TE / VAE 一组权重；按 HF 兼容缓存存储 | 不是适配器 |
| **Adapter** | LoRA / LyCORIS / DMD 等增量文件 | 不是完整模型 |
| **Diagnostic** | 从日志解析出的错误卡片：原因、解决方案、原始日志 | 不是普通 toast |
| **Announcement** | `release/` 中的公告 markdown | 不是应用内错误通知 |
| **稳定版** | `main` 分支 HEAD 或 manifest 的 `recommended_commit` | 不是上游 tag（MOSS-Image 没有 tag） |

## 4. 四窗口

| 窗口 | 路由 | 尺寸 | 内容 |
| --- | --- | --- | --- |
| 启动器 | `/` | 1180×760（最小 960×640） | 首页、实例、模型、训练、画廊、诊断、设置、OOBE |
| 创作 | `/studio` | 1320×860 | Studio、画布、layout JSON、画廊 |
| 终端 | `/terminal` | 1120×720 | Cases 列表 + xterm |
| Kohaku Trainer | `/trainer` | 1280×840 | 训练配置、命令预览、doctor、训练状态 |

窗口关系：

- 启动器是主窗口；关闭启动器不强制关闭创作/终端/训练窗口；
- 所有窗口共用同一份 renderer bundle，preload 通过
  `--clover-window=<kind>` 暴露 `windowKind`；
- `window:open` 支持指定 kind 与 route；重复打开会聚焦已有窗口；
- macOS 用 `hiddenInset` + `vibrancy: under-window`；Windows 用
  `titleBarStyle: hidden` + `titleBarOverlay`；Linux 走默认标题栏。

### 4.1 信息架构

```
启动器
├── 首页 Home          欢迎 · 启动条 · 运行栈 · 通知
├── 实例 Instances     列表 · 新建 · 版本/运行时/删除
├── 模型 Models        官方/量化/适配器 · 下载 · 详情
├── 训练 Training      trainerRoot · 仓库 · 版本 · 环境 · SSH host
├── 画廊 Gallery       outputs / 自定义目录 · 分页 · 详情
├── 诊断 Diagnostics   错误卡片 · 解决方案 · 清空
├── 设置 Settings      外观 · 网络/镜像 · 存储 · 画廊/背景 · 更新
└── OOBE               覆盖层：实例 / 运行时 / 模型
创作
├── Studio             提示词 · 画布 · 区域 · layout 编译
└── Gallery            与启动器同一套画廊
终端
└── Cases              推理 + 训练；xterm
Kohaku Trainer
└── 训练表单/状态/命令预览/环境体检
```

## 5. 启动器

### 5.1 首页

- 顶部欢迎语与简短说明；
- 右侧顶部是通知单矩形（默认展开，离开首页自动关闭）；
- 主区域背景图全幅铺满（默认 16:9 深灰占位，可在设置替换）；
- 底部固定宽度启动条，主区域居中，最大宽度 880 px；
- 启动条上方是任务列表：始终显示可折叠表头（进行中/待处理计数），没有运行任务时只保留表头；
- 任务表可折叠，可按名称/启动时间排序；运行中的任务在表内高亮；
- 启动后原启动条锁定为运行状态，并在上方插入一条新的空白启动条。

### 5.2 启动条

```text
[Case] [后端] [实例] [设备] [档位] [高级] [启动]
```

- **Case**：选择已保存的启动配置；保存时写入 `cases.json`；
- **后端**：`官方 Gradio` / `Clover（占位）`；Clover 选择后会提示未实现；
- **实例**：固定 commit 的 MOSS-Image worktree；
- **设备**：自动枚举 Apple MPS / NVIDIA CUDA / CPU；
- **档位**：`base` / `dmd8`；`dmd8` 当前只透传 profile，仍走官方 pipeline，真正 8 步采样器未实现；
- **高级**：端口、额外参数、并发覆盖（并发覆盖仍是后续）；
- **启动**：走预检；缺权重/缺运行时生成诊断，不静默下载。

### 5.3 Case、队列与运行

- Case 是可复用的**启动配置**，不是一次 Job；
- Case 配置持久化在 `cases.json`；
- 队列行写 `launch-queue.json`；重启时 queued 保留、starting/running 标 failed；
- 同设备默认 1 个真实任务，其余排队；本地训练期间本地推理排队；每 host 同时 1 个训练；
- 运行中 Jobs 进入运行栈，同时可在终端查看日志；
- 运行结束后 Job 历史/终端仍可回看日志；首页任务列表只显示当前会话的进行中/排队项。

### 5.4 OOBE

启动时检查是否存在至少一个“runtime ready + 模型可用”的实例：

- 不满足：每次启动默认显示单页三行清单——**实例 / 运行时 / 模型**；
- 每行给一个直接动作，不打开多步向导；
- 可“本次跳过”；下次仍不满足会再次出现；
- 三行分别给“去实例/去模型”的动作；跳过不会修改磁盘状态。

### 5.5 通知与诊断

- 通知是右上角单个大矩形；用标题、段落、发丝线分区，不做卡片套卡片；
- 默认展开；在非首页路由自动收起；
- 同一诊断 signature 去重；5 分钟内最多 3 条 toast；
- 错误先进入诊断列表；只有需要用户决策的错误才 toast；
- 每条诊断包含：发生了什么、为什么、可执行动作、原始日志入口。

## 6. 创作窗口

- 路由 `/studio`；独立窗口；
- Studio：Prompt、负向 Prompt、尺寸、步数、CFG、Seed；
- 画布：框选/移动/缩放区域，支持人物、物体、文字区域；
- 编译：按 [layout-schema.md](layout-schema.md) 转成官方
  `abs_centralized + yxyx`，插入 Prompt；
- 生成入口：**当前不接任务**；等 Clover 常驻后端；
- Project 持久化/图层：未实现；当前草稿只在内存；
- 画廊：与启动器同一套数据源；支持“用作布局底图”，跨窗口交接。

## 7. 终端窗口

- 左侧 Cases：推理与训练共用，行上标 `推理 / 训练`；
- 右侧 xterm：stdout/stderr/stdin；支持停止/重启；
- 训练 Job 显示 step/loss 概要与日志；
- 已完成任务保留，便于回看，不是只显示运行中；
- 终端背景与应用背景一致，xterm 使用透明主题。

## 8. Kohaku Trainer 窗口

### 8.1 边界

- 上游：`KohakuBlueleaf/KohakuMossTrainer`；
- 许可：KohakuMoss License 1.0（Apache-2.0 + 第 10 条命名要求）；
- **不打包、不 submodule、不 import 上游代码**；
- 启动器负责 clone、worktree、venv、命令拼装、进程监督；
- 窗口标题与页头明确标注 `Kohaku Trainer · External`，并链接上游许可。

### 8.2 训练页

- 配置 `trainerRoot`（设置里可选目录）；
- 拉取/更新 bare mirror：`<trainerRoot>/git/kohaku-trainer.git`；
- 选择分支 + commit，创建 per-commit worktree：
  `<trainerRoot>/versions/kohaku-<short>/`；
- 版本元数据写入 worktree 的 `trainer.json`；
- 环境：`<trainerRoot>/runtimes/<lockHash>/`，按平台 + Python + 依赖锁共享；
- 安装环境：`uv pip install -e <version>`（无 uv 时 pip），可运行
  `kohakumoss-doctor`；代码路径已接，本机无 CUDA，未验收；
- 训练主机：local 固定一条；SSH host 可添加/删除/测试并持久化
  （host/user/port/identityFile/trainerRoot），不存密码。

### 8.3 训练窗口

- 选择 TrainerVersion；
- 权重目录、数据集目录、Run 名称；
- 算法、steps、LR、Dim、Alpha、microbatch、目标边长；
- 高级覆盖：每行 `KEY=VALUE`，透传 `--set`；
- 命令预览：`kohakumoss-config new train ...` +
  `kogine run scripts/train/moss.py ...`；
- 环境体检：`kohakumoss-doctor`；
- 运行：CUDA 主机上启动 train / inspect_data / cache_text / cache_latents
  （代码路径；真实 CUDA 未验收）；
- 状态：训练 Job 的 step/loss/进度；终端看完整日志；
- 导出/采样：**当前只提供可复制的命令入口**，不执行；
- macOS 无 CUDA：开始按钮禁用；只能部署、管理、编辑、预览。

### 8.4 SSH（骨架）

- `TrainingHost` 数据模型已落地并持久化到 `training-hosts.json`；
- UI 支持添加/删除/测试；
- 系统 OpenSSH + 密钥/agent、远端 mirror/worktree/venv/train/export 代码已接；
- **真实 host 未验收**；远程路径不做自动上传；

## 9. 画廊、背景、设置

### 9.1 画廊

- 启动器侧栏全局入口；创作窗口也保留；
- 来源：应用 outputs、实例 outputs、`settings.galleryRoots`；
- 递归深度 ≤ 5，跳过隐藏目录与 `node_modules/.git`；
- cursor + limit（默认 48）+ IntersectionObserver；
- `content-visibility: auto` + lazy image；
- 详情：尺寸/大小/路径/元数据；“用作布局底图”；
- 自定义协议 `clover://` 只允许画廊根与背景图路径。

### 9.2 背景

- 默认：`src/renderer/src/assets/home-background.webp`（16:9 深灰）；
- 设置里可选任意本地图片并预览 16:9；
- 背景以 `linear-gradient(...) + url(...)` 铺满所有启动器页面、
  创作窗口、终端、训练窗口；
- 自定义图有更深的遮罩，默认图更亮。

### 9.3 设置

| 分组 | 内容 |
| --- | --- |
| 网络与镜像 | 自动/直连/镜像；git/pip/HF 端点 |
| 存储 | 模型目录、自定义模型根、训练器根目录、磁盘 |
| 外观 | 背景图选择/恢复默认；深色固定 |
| 更新 | 检查更新（不安装） |
| 画廊 | 额外根目录 |
| 设备 | 启用/禁用/重命名；启动条过滤 |
| 运行时 | Python 解释器路径、Node/Chrome 信息；托管 Python 未接 |

## 10. 视觉与交互规范

| 项 | 规范 |
| --- | --- |
| 主题 | 只保留深色；中性深灰，不用深蓝底、不用蓝色渐变、无绿色 |
| 文字 | 冷调浅蓝白；浅蓝只做激活/焦点/少量图标 |
| 材质 | 标题栏/侧栏 `.glass-thin`；内容 `.content-surface`；卡片 `.glass`；弹层 `.glass-strong` |
| 标题栏 | 44 px；应用名居中 + `dev/release` + 版本；无侧栏 Logo |
| 侧栏 | 200 px ↔ 56 px；选中只做灰色背景，不加蓝色提示条 |
| 圆角 | 控件 4–6 px；卡片 8 px；弹层 10 px；不用大圆角胶囊 |
| 控件 | 约 30–32 px 高；宽度随文字；Fluent 2 取向；Apps SDK UI |
| 间距 | 8 px 网格；内容区 24–28 px |
| 动效 | 120–200 ms ease-out；侧栏宽度/进度条平滑 |
| 空状态 | 一句解释 + 一个主行动；不放插画大图 |
| 可访问性 | 键盘可达、焦点可见；对比度目标 ≥ 4.5:1 |

### 10.1 禁止项

- 绿色成功色、绿色渐变、绿色状态块；
- 深蓝背景/蓝色渐变；
- 侧栏每个选中项左侧的蓝色提示条；
- 通知卡片套卡片；
- 过大的胶囊按钮/药丸；
- 在首页启动条和通知之间做嵌套层级。

## 11. 错误、日志与文案

- 文案顺序：发生了什么 → 为什么 → 可以做什么；
- 不出现裸 traceback；原始日志折叠；
- 不出现“未知错误”；至少归类为异常退出，附 exit code 与最后日志；
- 错误码稳定：`E_OOM`、`E_DISK`、`E_NET`、`E_MODEL`、`E_MODULE` 等；
- 修复动作可撤销/可重试；
- 训练 Job 的错误同样进入诊断，不只留在终端。

## 12. 当前范围与已验证边界

**已实现并有本机/fake 证据：**

- 四窗口、OOBE、通知、背景、画廊；
- 环境报告、实例、运行时、模型/下载；
- Supervisor、薄 runner（模拟）、解析、诊断、终端；
- trainer mirror/worktree/版本、训练窗口、远端代码路径；
- 训练 Job/loss 链路（模拟/fake ssh）；
- 队列行/训练产物登记代码。

**实现但未在目标环境验收：**

- 官方 Gradio 真实启动（缺 27 GB 权重）；
- 真实 CUDA 训练（本机无 CUDA）；
- trainer 环境安装（未在 CUDA 主机执行）；
- 数据检查/缓存（代码已拼装，未真实运行）；
- SSH host/远端代码只验证 fake ssh，没有真实连接；
- 队列完整重启、设备维护完整流程未验收。

**未实现：**

- Clover 常驻后端、Project 持久化/图层；
- 队列完整重启验收、设备维护完整验收、强制并发/显存配额；
- 训练导出/采样真实 CUDA 验收；
- SSH 远端真实 host 验收；
- WebUI、应用内更新安装、打包/公证；
- Windows 实机验证。

> 逐项证据与限制以 [status.md](status.md) 为准。

## 13. 后续设计（未实现）

1. **Clover 常驻后端**：本地 HTTP/WS；创作窗口连接；终端看服务日志；
2. **Project + 图层**：Project 独立于 Case；持久化画布/图层/资产；
3. **SSH 真实 host 验收**：host key/权限、远端 mirror/worktree/venv、远端 Job/日志；
4. **训练收尾**：真实 CUDA 验收、导出/采样真实执行、loss 曲线；
5. **启动器加固**：队列完整重启验收、设备维护验收、Gradio 真机、27 GB 权重；
6. **M5 WebUI + 更新**：Fastify/SSE、token/局域网、更新下载/安装；
7. **M6 打包**：macOS 签名/公证、Windows NSIS、设备矩阵；
8. **V2 推理引擎**：见 [future-inference-engine.md](future-inference-engine.md)，未排期。

## 14. 目标用户

| 用户 | 场景 | 关键诉求 |
| --- | --- | --- |
| Mac 设计师/爱好者 | 想在本机试 MOSS | 不用碰终端；知道能不能跑、要等多久 |
| Windows/Linux 玩家 | 多实例、多 LoRA | 版本隔离、模组式管理、下载队列 |
| 研究者/小团队 | 复现某个 commit / 训练 | 固定版本、日志可追溯、训练可部署 |
| 训练用户 | 有 NVIDIA 机器 | 部署 trainer、管环境、看 loss、终端排错 |

## 15. 非目标

- 自研推理/训练内核（V1）；
- 云端账号、模型市场后端、遥测；
- 移动端原生应用；
- 自动上传数据集到远端；
- 在 macOS 上跑 KohakuMossTrainer（上游不支持 MPS）。
