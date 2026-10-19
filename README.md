# CloverMoss Launcher

> 为 [MOSS-Image](https://github.com/OpenMOSS/MOSS-Image) 做的跨平台启动器：
> 装得快、版本分得清、权重不迷路、创作与画廊在一个窗口里。

**状态：M1–M3 + UI v0.2 可运行。** 环境报告、公告/更新检查、git 实例、
共享/独立运行时、模型/适配器下载、通知中心、画廊、创作台与 layout 标注器均已落地；
真正的生成运行在 M4 接入。

![首页](docs/assets/home.webp)

## 现在能做什么

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 亚克力窗口 | ✅ | macOS `vibrancy` + Windows `acrylic`，非支持平台回退到蓝白渐变 |
| 可折叠侧栏 | ✅ | 212 px ↔ 64 px，状态持久化 |
| 通知中心 | ✅ | 右上角抽屉，默认打开；分「公告」（release）与「应用内通知」两块圆角卡片 |
| 首页 | ✅ | “今天想在 Moss 中画点什么？” + 实例列表 + 教程案例 + 最近作品 |
| 创作台 | ✅ | Prompt、负面词、尺寸/步数/CFG/Seed、实例选择、运行未接入提示 |
| Layout 标注器 | ✅ | 画框、移动、缩放、物体/人物/文字标签、官方 JSON 编译器 |
| 画廊 | ✅ | 读取输出目录/自定义路径；分段加载 + `content-visibility`；元数据与“用作布局底图” |
| 设备环境报告 | ✅ | 系统 / GPU / 内存 / 磁盘 / Python / git / 网络 / 端口，附推荐档位 |
| 实例管理 | ✅ | bare 镜像 + worktree，固定 commit；main HEAD / 推荐提交标稳定版 |
| 运行时 | ✅ | 按依赖锁哈希共享；uv/venv + uv pip/pip；一键转独立 |
| 模型 / 适配器 | ✅ | 官方权重、社区 int8/int4、DMD；HF 兼容缓存、断点续传、sha256 |
| 生成运行 / 进度 / 诊断 | ⏳ M4 | runner、Gradio、tqdm 翻译、错误卡片 |
| WebUI / 更新安装 | ⏳ M5 | 浏览器模式、应用内更新 |

## UI 设计

- **只用白色 / 浅蓝 / 冷灰**，不包含任何绿色元素；强调色 `#2563eb`；
- 深色为深海军蓝，浅色为蓝白；卡片、侧栏、顶栏、通知抽屉统一使用
  `glass` / `glass-strong` 半透明层；
- macOS 使用 `vibrancy: under-window` 透出桌面，Windows 使用 `backgroundMaterial: acrylic`；
  截图/不支持平台回退为渐变背景；
- 默认窗口 **1180×760**（不是全屏），最小 960×640。

![通知中心](docs/assets/notifications.webp)

![创作台与布局标注](docs/assets/studio.webp)

![画廊](docs/assets/gallery.webp)

![折叠侧栏](docs/assets/sidebar-collapsed.webp)

## 快速开始

需要 Node 20+、pnpm 9+。首次启动会自动扫描环境，不会下载权重。

```bash
pnpm install
pnpm dev
```

构建与自检：

```bash
pnpm build
pnpm typecheck

# 无窗口自检：环境 + 公告 + 目录
env -u ELECTRON_RUN_AS_NODE pnpm --filter @clover/desktop exec electron . --smoke
```

> 某些 CI / harness 会设置 `ELECTRON_RUN_AS_NODE=1`，此时 Electron 会以 Node 运行，
> 需要像上面那样临时去掉。普通桌面环境不需要。

开发数据写在仓库内 `.dev-data/`（已忽略），不会碰真实用户目录。

## 技术栈

- **Electron 44 + TypeScript + React 19**，`electron-vite` 构建；
- **UI：`@openai/apps-sdk-ui`**（MIT，Tailwind 4 + Radix 底座）+ 自定义蓝色 token；
- 主进程：类型化 IPC + zod + 领域服务（env / network / git / runtimes / instances /
  models / updates / gallery），当前 JSON 持久化，M4 换 SQLite；
- 本地图片：`clover://` 自定义协议，只允许画廊根目录与首页背景；
- 渲染层：Zustand + React Router；
- Layout 编译器：按官方 `compile_prompt.py` 规则实现，见 [docs/layout-schema.md](docs/layout-schema.md)。

## 仓库结构

```
apps/desktop/
  src/main/          Electron 主进程 + 领域服务 + IPC + clover 协议
  src/preload/       contextBridge（只暴露 invoke / on / acrylic）
  src/renderer/
    src/pages/       Home / Studio / Gallery / Instances / InstanceDetail / Models / Settings
    src/components/  layout / NotificationPanel / ui / ErrorBoundary
    src/lib/         layout 编译器 / clover URL / api / format / i18n
  src/shared/        types / channels / zod schemas
release/             更新源：manifest.json、公告 README、模型目录、错误规则
contracts/           协议与 schema（release / runner / job）
docs/
  product-design.md  产品设计文档
  architecture.md    架构文档
  status.md          M1–M3 与 UI v0.2 实现状态、实测
  layout-schema.md   官方 layout JSON 调研与编译器规则
  roadmap.md         里程碑
  decisions/         ADR
  assets/            UI 截图
tools/budget.py      算力 / 显存预算工具
```

## 文档

- [产品设计](docs/product-design.md)：用户、界面、流程、错误策略、视觉规范；
- [架构](docs/architecture.md)：进程模型、数据模型、git/运行时/下载/监督/解析/更新；
- [实现状态](docs/status.md)：已完成、实测证据、与设计的差异、下一步；
- [Layout 规范](docs/layout-schema.md)：草稿/编译两种坐标系、校验与官方对拍；
- [路线图](docs/roadmap.md)：M0–M6 与验收标准；
- [Runner 协议](contracts/runner-protocol.md)、[更新清单 schema](contracts/release-manifest.schema.json)。

## 不做什么（V1）

- **不做自有推理后端**：运行官方 Python 代码；引擎是 V2 的事，见
  [ADR-0003](docs/decisions/0003-launcher-first.md) 与
  [未来引擎架构](docs/future-inference-engine.md)。
- 不做训练 UI（训练器以外部进程接入，见 [ADR-0002](docs/decisions/0002-trainer-backend.md)）。
- 不做 img2img / 移动端 / 云账号。

## 许可

本仓库代码 MIT（见 [LICENSE](LICENSE)）。MOSS-Image 权重与代码为 Apache-2.0。
参考实现（mlx-serve、moss-image-swift）为 MIT，只做行为对照。
不包含 KohakuMossTrainer 代码。
