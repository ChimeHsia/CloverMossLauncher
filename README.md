# CloverMoss Launcher

> 为 [MOSS-Image](https://github.com/OpenMOSS/MOSS-Image) 做的跨平台启动器：
> 装得快、版本分得清、权重不迷路、进度看得懂、报错能修、更新不用盯 GitHub。

**状态：M0 · 设计定稿，代码未开始。** 本仓库当前包含产品设计、架构、协议与更新源配置。

## 它解决什么

MOSS-Image 是一个 5B DiT + Qwen3.5-9B 文本编码器 + FLUX.2 VAE 的文生图模型，
官方形态是「git clone → 装 Python 依赖 → 跑 gradio_app.py」。对普通用户来说：

- 不知道自己的机器能不能跑、该用多大分辨率；
- 多个 commit / 分支 / LoRA 互相污染；
- 27 GB 权重下载没有队列、断点、镜像；
- tqdm 进度只在终端里，报错是几百行 traceback；
- 官方更新了，只能自己刷 GitHub。

启动器把这些变成**一个 960×640 的小窗口**：首页给环境报告和公告，实例页管理版本，
模型页管理权重与 LoRA，运行页给进度和控制台，诊断页给可点击的解决方案。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 环境体检 | 系统 / Metal·CUDA / 内存 / 磁盘 / Python / git / 网络，逐项给结论与修复入口 |
| 实例管理器 | 绑定到具体 commit 的 worktree；`main` HEAD 标为稳定版；可回滚、克隆、导出 |
| 运行时 | 默认共享 Python 环境（按依赖锁哈希），可一键转独立；支持托管 Python，无需预装 |
| 模型 / 适配器 | 官方权重、社区量化、LoRA/DMD 的统一下载队列、哈希校验、启用/禁用 |
| 运行 | 薄 runner（NDJSON 进度）或官方 Gradio；stdout/stderr/stdin 全接管 |
| 日志翻译 | tqdm → 阶段化进度条；OOM/缺包/网络等 → 带解决方案的诊断卡片，防弹窗循环 |
| WebUI | 启动器自身的浏览器模式（手机可看队列/画廊）+ 官方 Gradio 两个入口 |
| 更新 / 公告 | 启动时读 [`release/manifest.json`](release/manifest.json)，公告来自 [`release/README.md`](release/README.md) |
| 自动换源 | 探测 GitHub / PyPI / HuggingFace，按网络位置自动选镜像，可手动覆盖 |

## 不做什么（V1）

- **不做自有推理后端**：当前运行官方 Python 代码；引擎是 V2 的事，见
  [ADR-0003](docs/decisions/0003-launcher-first.md) 与
  [未来引擎架构](docs/future-inference-engine.md)。
- 不做训练 UI（训练器将以外部进程接入，见 [ADR-0002](docs/decisions/0002-trainer-backend.md)）。
- 不做 img2img / 移动端 / 云账号。

## 技术栈

- **Electron + TypeScript + React 19**，`electron-vite` 构建；
- **UI：`@openai/apps-sdk-ui`**（MIT，Tailwind 4 + Radix 底座）+ 自定义 Moss 强调色；
- 主进程：领域服务 + SQLite（`better-sqlite3`）+ 类型化 IPC；
- WebUI：Fastify 复用同一服务层，HTTP/SSE；
- 外部程序：git、Python（托管或系统）、uv/pip、runner/Gradio，全部经 Supervisor。

## 仓库结构

```
apps/                Electron 壳、React 渲染层、Web 服务
packages/            领域服务、解析器、契约、UI 组件
runner/              薄 runner（Python，随应用分发）
release/             更新源：manifest.json、公告 README、模型目录、错误规则
contracts/           协议与 schema（release / runner / job）
docs/
  product-design.md  产品设计文档
  architecture.md    架构文档
  roadmap.md         里程碑
  decisions/         ADR：运行时分叉、训练器、启动器优先
  model-notes.md     模型事实与数值约定（预算依据）
  research/          上游生态与实测数据
tools/budget.py      算力 / 显存预算工具
```

## 现在能跑什么

还没有可执行的应用。可以先看文档、校验 schema、生成预算表：

```bash
python3 tools/budget.py --markdown
python3 -m json.tool release/manifest.json > /dev/null   # 校验 JSON
```

## 文档

- [产品设计](docs/product-design.md)：用户、界面、流程、错误策略、视觉规范；
- [架构](docs/architecture.md)：进程模型、数据模型、git/运行时/下载/监督/解析/更新；
- [路线图](docs/roadmap.md)：M0–M6 与验收标准；
- [Runner 协议](contracts/runner-protocol.md)、[更新清单 schema](contracts/release-manifest.schema.json)；
- [模型事实](docs/model-notes.md)：为什么 16 GB 机器必须用 8 步 DMD。

## 许可

本仓库代码 MIT（见 [LICENSE](LICENSE)）。MOSS-Image 权重与代码为 Apache-2.0。
参考实现（mlx-serve、moss-image-swift）为 MIT，只做行为对照。
不包含 KohakuMossTrainer 代码。
