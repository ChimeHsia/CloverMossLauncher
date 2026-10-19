<div align="center">

<h1>Clover Moss Launcher</h1>

<img src="apps/desktop/src/renderer/src/assets/clovermoss-logo.svg" alt="Clover Moss Launcher 标志" width="580" />

**面向 MOSS-Image 的桌面管理与创作工作台**

MOSS-Image 的桌面启动器与工作台：管理实例、运行时、模型和任务，并为创作、终端、训练与设备提供独立窗口。

**开发版 0.1.0** · 设计文档 v0.4 · 当前重点：功能持续实现，真实模型、CUDA 与发布环境验收进行中

</div>

![启动器首页](docs/assets/home.webp)

## 项目简介

Clover Moss Launcher 是 MOSS-Image 的桌面编排器，目标是让用户可以管理代码版本和 Python 环境、选择设备与工作台、启动任务并查看日志，而不必把日常操作都放在终端里。它本身不是推理引擎，也不重写训练器：推理由上游 Python / Gradio 或项目 runner 执行，训练通过外部 KohakuMossTrainer 接入。

项目仍处于开发阶段。功能状态和可重复验证证据以[实现状态](docs/status.md)为准；表格中的“部分 / 待验收”表示代码路径存在，但尚未在真实权重、NVIDIA CUDA、SSH 主机或正式安装包上完整验证。

## 功能概览

| 模块 | 当前能力 | 状态 |
| --- | --- | --- |
| 启动器与环境检查 | 系统、GPU、内存、磁盘、Python、网络检查；MOSS 实例、共享/独立运行时与推荐档位 | 已实现 |
| 模型与下载 | 模型/适配器目录、HF 兼容缓存和下载流程；模型包绑定仍在完善 | 部分 |
| 启动与任务 | Case、官方 Gradio 启动参数、设备选择、任务队列、Supervisor 与共享终端 | 已实现 / 部分验收 |
| 创作台 | Prompt、画布区域标注、官方 Layout JSON 编译；Project 自动保存和基础图层 | 部分，完整 UI 与真实生成待验收 |
| 画廊与诊断 | 输出浏览、元数据、布局底图交接；错误识别、去重与处理建议 | 已实现 |
| 训练与设备 | 外部 Trainer 版本/环境管理、训练窗口、本机与 SSH host 管理 | 代码已接，真实 CUDA/SSH 待验收 |
| 远端实例与 Gradio | SSH mirror/worktree/venv、placement、设备过滤、SSH 端口转发与输出回传 | fake ssh 端到端，真实 host 待验收 |
| 公告与更新 | Release 文档解析、更新提示、下载和 SHA-256 校验 | 代码已接，真实发布包/签名待验收 |

### 已知边界

- 本机验证环境为 Apple M3 / 16 GB；没有下载约 27 GB 的 SFT 权重，真实生成尚未验收。
- 当前没有 NVIDIA CUDA 环境；真实训练、Trainer 环境与远端训练尚未验收。SSH 流程目前以 fake ssh 测试为主。
- 远端 Instance 与官方 Gradio 隧道已在 fake ssh 下端到端验证（部署/切版本/输出回传/取消/删除）；真实 host、远端模型下载未验收。
- Clover 创作生成链路已接入后端，但缺少权重与运行时验证；Project 的完整 UI 和资产回链仍在完善。
- DMD 8 步档位当前只是参数透传，实际仍走官方 pipeline；真正的 DMD 采样器未实现。
- 更新流程是“用户批准后下载、校验并打开安装包”，不是静默自动安装；签名、公证和 Windows 实机验证未完成。
- Clover Creator 是 Electron-only，不提供浏览器 WebUI。未来引擎构想不代表当前实现。

逐项状态、测试场景及限制见[实现状态与验证证据](docs/status.md)。

## 产品结构

应用由五个相互协作的窗口组成，共用 Electron 主进程、React renderer 和任务状态：

| 窗口 | 职责 |
| --- | --- |
| 启动器 | 首页启动条与运行栈、实例、模型、画廊、训练、诊断、设置与首次启动检查 |
| 创作 | Prompt、画布与 Layout 编译、Project 和画廊 |
| 终端 | 集中查看推理与训练任务的日志、进度和控制 |
| Kohaku Trainer | 管理外部 Trainer 版本、环境、训练参数与命令 |
| 设备管理器 | 管理本机/SSH 主机、设备库存、连接测试与路径 |

典型流程：检查环境 → 创建固定到指定 commit 的实例 → 准备运行时与模型 → 选择 Case、设备和工作台 → 启动任务 → 在任务列表、终端、画廊或诊断页跟进结果。

![创作窗口](docs/assets/studio.webp)

## 技术栈与语言

| 层 | 技术 | 用途 |
| --- | --- | --- |
| 桌面应用 | Electron 44、electron-vite | 主进程、窗口、preload 与桌面能力 |
| 前端 | React 19、TypeScript、React Router | 五窗口共用的 renderer 与交互界面 |
| UI | Tailwind CSS 4、`@openai/apps-sdk-ui`、Lucide | 样式、控件与图标 |
| 状态与校验 | Zustand、Zod | 前端状态、IPC 输入校验与共享 schema |
| 后端服务 | Node.js / TypeScript | Electron 主进程领域服务及本机 HTTP/WS utility process |
| 推理编排 | Python 3 | 薄 runner、NDJSON 任务协议；模型执行依赖上游 MOSS-Image 环境 |
| 配置与协议 | JSON、Markdown | 应用设置、模型/发布清单、契约、文档 |
| 包管理 | pnpm workspace | 管理桌面应用及仓库级脚本 |

项目不包含自研推理内核，也不把 KohakuMossTrainer 代码 vendoring 或打包进仓库。当前持久化主要是应用数据目录中的 JSON 文件与项目资产，不依赖数据库服务。

## 开发指南

### 环境要求

- Node.js 与 pnpm；仓库声明的包管理器版本为 pnpm `9.14.2`。
- Python 用于 runner / MOSS-Image 运行环境；只做 UI、主进程或类型检查时不要求预装模型权重。
- 真实生成需要可用的 MOSS-Image 运行时与模型权重；训练需要受支持的 NVIDIA CUDA 环境。

### 启动与检查

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm build
pnpm smoke
```

如果测试 harness 设置了 `ELECTRON_RUN_AS_NODE=1`，可显式清除此变量后运行桌面 smoke：

```bash
env -u ELECTRON_RUN_AS_NODE pnpm --filter @clover/desktop exec electron . --smoke
```

开发数据写入仓库根目录的 `.dev-data/`，该目录已忽略，不会覆盖真实用户数据。开发场景、截图和模拟任务命令见[应用开发手册](apps/README.md)。

### 代码导览

```text
apps/desktop/src/
  main/       Electron 生命周期、窗口、IPC、领域服务
  preload/    contextBridge 白名单接口
  renderer/   React 页面、组件、状态与样式
  backend/    本机 HTTP/WS Job API（utility process）
  shared/     TypeScript 类型、IPC channel、schema 与启动协议
runner/       Python runner 与 NDJSON 事件协议
release/      发布清单、模型目录与公告源
contracts/    Job、模型、发布与 runner 协议契约
docs/         产品设计、架构、状态、路线图、ADR 与研究
tools/        仓库维护脚本
```

实现约定：主进程持有领域状态并通过服务层处理系统操作；renderer 不直接访问 Node，所有系统能力经 preload 白名单和类型化 IPC 调用；推理、训练等长任务由 Supervisor 统一管理。新增能力时优先沿用现有 service / IPC / shared schema 分层，并在实现后同步更新状态文档与验证证据。

常用维护命令：`pnpm release:md` 生成 `release/release.md`，`pnpm release:md:check` 检查生成结果是否同步。

## 产品设计与文档

| 入口 | 内容 |
| --- | --- |
| [文档索引](docs/README.md) | 文档地图、状态标记和维护规则 |
| [产品设计](docs/product-design.md) | 产品定位、五窗口、交互模型、设计约束与非目标 |
| [实现状态](docs/status.md) | 当前完成度、验证证据、已知限制；功能状态的事实来源 |
| [架构说明](docs/architecture.md) | 进程、窗口、IPC、领域服务、数据模型与任务链路 |
| [路线图](docs/roadmap.md) | 下一阶段优先级与验收条件 |
| [Layout JSON 规范](docs/layout-schema.md) | 画布坐标、编译格式、校验规则与示例 |
| [Clover 后端与 Project](docs/backend-and-project.md) | 本机 HTTP/WS API、Project 文件与边界 |
| [发布与更新](docs/release-and-updates.md) | Release 文档格式、更新流程与发布检查清单 |
| [应用开发手册](apps/README.md) | 目录结构、开发命令、场景测试与设计系统 |
| [Runner 协议](runner/README.md) | Python runner、NDJSON 事件、取消和模拟模式 |
| [决策记录](docs/decisions/) | 关键架构与产品决策（ADR） |
| [未来推理引擎](docs/future-inference-engine.md) | V2 设计输入，当前未排期、未实现 |

建议阅读顺序：先看本文和[实现状态](docs/status.md)，再按需要阅读[产品设计](docs/product-design.md)、[架构说明](docs/architecture.md)及对应专题文档。代码和运行结果优先于设计稿；代码路径存在不等于目标环境已验收。

## 许可

本仓库代码采用 MIT License，见 [LICENSE](LICENSE)。MOSS-Image 权重与上游代码采用其各自许可；KohakuMossTrainer 是外部项目，不包含在本仓库中，使用时需遵守其 KohakuMoss License 1.0。
pnpm build
