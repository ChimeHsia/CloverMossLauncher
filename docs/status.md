# 实现状态（M1–M4 + UI v0.3）

- 日期：2026-10-19
- 范围：三窗口启动器、OOBE、启动条/运行栈、官方 Gradio、xterm 终端、
  M1–M4 的环境/实例/运行时/模型/画廊/诊断
- 对应路线图：[roadmap.md](roadmap.md)

## 1. 现在能跑什么

```bash
pnpm install
pnpm dev                 # 启动器窗口 1180×760（非全屏）
pnpm build
pnpm typecheck
```

开发数据在 `.dev-data/`（已忽略）。harness 里需去掉 `ELECTRON_RUN_AS_NODE`：

```bash
env -u ELECTRON_RUN_AS_NODE pnpm --filter @clover/desktop exec electron . --smoke
```

## 2. 已完成

### 2.1 基础（M1–M3）

| 模块 | 实现 |
| --- | --- |
| 应用壳 | Electron 44 + electron-vite 6 + React 19 + Tailwind 4 + Apps SDK UI |
| IPC | preload 只暴露 `invoke/on`；主进程 zod 校验；`IpcResult` 统一错误 |
| 环境报告 | 系统/GPU/内存/磁盘/Python/git/网络/端口 + 推荐档位 |
| 公告更新 | `release/manifest.json`、公告 markdown、缓存、镜像 |
| 实例 | bare git 镜像、worktree、固定 commit、稳定版标记、删除保留输出 |
| 运行时 | 共享/独立 venv、依赖锁哈希、uv/pip、日志事件 |
| 模型 | HF 兼容缓存、断点续传、LFS sha256、暂停/继续、磁盘保护 |

### 2.2 创作 / 画廊 / 诊断（UI v0.2 + M4）

| 模块 | 实现 |
| --- | --- |
| 创作窗口 | Studio、尺寸/步数/CFG/Seed、画布标注、官方 layout 编译器 |
| 画廊 | outputs + 自定义目录、`clover://`、48/页、`content-visibility`、元数据 |
| 运行监督 | `supervisor.ts`：spawn、job.json、180s readiness、取消、进程组 kill、JSON 持久化 |
| 解析 | ANSI、`\r/\n` 分帧、tqdm、下载条、错误规则、signature 去重 |
| 诊断 | 去重、5 分钟 3 条 toast 预算、解决方案、本地持久化 |
| 通知 | 单大矩形抽屉，公告 + 应用内通知，默认展开 |

### 2.3 三窗口 UI v0.3

| 模块 | 实现 |
| --- | --- |
| 窗口 | `windows.ts`：启动器 / 创作 / 终端；标题栏居中 `CloverMoss` + `dev/release` + 版本；画廊进启动器侧栏 |
| 视觉 | 中性深灰亚克力、冷调浅蓝白文字；侧栏/标题栏恢复薄透明度；无绿色/蓝色提示条；4–6 px 小圆角 |
| 控件 | Fluent 2 紧凑按钮/分段/输入；按钮宽度随文字；去 Logo / 去侧栏品牌块 |
| 首页 | 欢迎语 + 底部启动条 + 运行栈；启动条固定宽度居中；16:9 背景图（设置可换） |
| 启动条 | Case、后端（官方 Gradio / Clover 占位）、实例、设备、档位、高级、启动 |
| 运行栈 | 新启动条置顶；运行中 Case 可折叠/按名称/启动时间排序；同设备默认 1 个任务，其余排队 |
| 设备 | 自动枚举 Apple MPS / NVIDIA CUDA / CPU；暂不做维护页 |
| Case | `cases.json` 保存实例+后端+设备+档位+端口/参数；启动器下拉选择 |
| 背景 | `assets/home-background.webp` 16:9 占位；设置可 pick 任意图并预览；全幅铺到所有页面与终端 |
| 官方 Gradio | `gradio_app.py` + 端口/额外参数；URL readiness；打开界面/终端/停止 |
| 终端 | 独立窗口；左 Case 列表 + 右 xterm.js；stdout/stderr/stdin；停止/重启 |
| OOBE | 启动器内全屏遮罩；实例/运行时/模型三行；可关闭；每次启动检查 |
| 创作窗口 | 独立 BrowserWindow；Studio/画廊；生成入口提示下一轮 Clover 后端 |

## 3. 实测证据

在本机 **Apple M3 / 16 GB / macOS 15.7.7**：

| 验证 | 方式 | 结果 |
| --- | --- | --- |
| 构建/类型 | `pnpm build` / `pnpm typecheck` | 通过 |
| 自检 | `--smoke` | 通过；M3 / 16 GB / 网络镜像 |
| 三窗口 | `--scenario=windows` | 通过 `window:open` 创建/聚焦创作与终端窗口 |
| 三窗口截图 | `--screenshot` | 启动器、创作、终端分别出图 |
| OOBE | `--screenshot` | 缺模型时自动出现，单页三行 |
| 启动条 | `--screenshot` 点击“启动” | 缺权重预检生成 E_MODEL 诊断 + toast，不误下载 |
| 设备枚举 | 首页 | `Apple M3 · Metal / MPS` + CPU |
| 终端 | `--screenshot` | xterm 显示模拟任务 stdout/stderr |
| 布局编译器 | Node 跑 `layout.ts` | 与官方示例逐字段一致 |

截图：

![OOBE](assets/oobe.webp)
![启动器首页](assets/home.webp)
![创作窗口](assets/studio.webp)
![画廊](assets/gallery.webp)
![终端](assets/terminal.webp)
![诊断](assets/diagnostics.webp)
![设置](assets/settings.webp)
![实例](assets/instances.webp)

## 4. 与目标的差距（有意保留）

1. **Clover 常驻后端下一轮**：本轮只真启动官方 Gradio；Clover Case 下拉可见但会提示。
2. **Project 持久化未做**：Studio 的画布/JSON 仍只在内存；Project 将独立于 Case。
3. **Cases 已持久化，运行排队只在会话内**：`cases.json` 保存配置，队列重启丢失；下一轮落盘。
4. **创作窗口“开始生成”暂不接任务**：等 Clover 常驻后端。
5. **官方 Gradio 未真机验收**：本机没有 27 GB SFT 权重；代码路径已接，预检会拦截。
6. **同设备并发只做默认 1 个 + 排队**：强制并发/显存配额后续。
7. **设备维护页未做**：当前只自动枚举 + 下拉。
8. **浅色主题已移除**：只保留深灰亚克力。
9. **Windows 未实机验证**：已接 `titleBarOverlay` + acrylic。
10. **终端列表包含已完成任务**，便于回看日志；不是只显示运行中。

## 5. 开发辅助

```bash
# 无窗口自检
... electron . --smoke

# 截图启动器 / 创作 / 终端
... electron . --screenshot

# 模拟任务 / 取消 / 解析 / 缺权重预检
... electron . --scenario=job
... electron . --scenario=job-cancel
... electron . --scenario=parser
... electron . --scenario=job-real
```

## 6. 下一轮

1. Clover 常驻后端（本地 HTTP/WS）+ 创作窗口连接；
2. Project 持久化 + 图层系统；
3. 官方 Gradio 真机验收、队列落盘、设备维护/强制并发；
4. M5 WebUI + 应用内更新。
