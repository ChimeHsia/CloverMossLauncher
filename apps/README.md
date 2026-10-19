# apps/

V1 单包 `apps/desktop`：Electron 主进程 + preload + React 渲染层一起构建。
同一套 renderer 载入三个窗口；M5 WebUI 再抽服务层与渲染层。

## 结构

```
apps/desktop/
  electron.vite.config.ts
  src/main/
    index.ts                生命周期、smoke / screenshot / scenario
    windows.ts              启动器 / 创作 / 终端三窗口
    ipc.ts                  ipcMain.handle + zod 校验 + 事件
    lib/                    paths / run / events
    services/               env / network / git / runtimes / instances / models /
                            updates / settings / gallery / supervisor / parsers /
                            diagnostics / devices / cases / onboarding
  src/preload/index.ts      contextBridge：invoke / on / windowKind / acrylic / channel
  src/renderer/
    src/App.tsx             按 windowKind 分流 Launcher / Creator / Terminal
    src/pages/              Home / Studio / Gallery / Terminal / Diagnostics /
                            Instances / InstanceDetail / Models / Settings
    src/components/         AppTitlebar / layout / NotificationPanel / Oobe / ui
    src/store.ts            Zustand（通知、启动栈、任务、画廊）
    src/lib/                layout.ts / clover.ts / windows.ts / api
    src/styles.css          深灰亚克力 token + Fluent 2 控件
  src/shared/               types / channels / schemas
```

## 运行

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

部分 harness 设置 `ELECTRON_RUN_AS_NODE=1`，需临时去掉：

```bash
env -u ELECTRON_RUN_AS_NODE pnpm --filter @clover/desktop exec electron . --smoke
```

## 三窗口

| 窗口 | 路由 | 尺寸 | 内容 |
| --- | --- | --- | --- |
| 启动器 | `/` | 1180×760 | 首页启动条/运行栈、实例、模型、诊断、设置、OOBE |
| 创作 | `/studio` | 1320×860 | Studio、layout JSON、画廊 |
| 终端 | `/terminal` | 1120×720 | Cases 列表 + xterm |

`src/main/windows.ts` 负责创建/单例/聚焦；preload 通过
`--clover-window=<kind>` 提供 `windowKind`，渲染层只加载对应 shell。

## 开发自检

| 命令 | 作用 |
| --- | --- |
| `--smoke` | 无窗口环境/公告/模型目录 |
| `--screenshot` | 启动器 + 创作 + 终端截图 |
| `--scenario=create` / `second` / `install` | 实例、共享 runtime、依赖 |
| `--scenario=job` / `job-cancel` | 模拟任务、取消 |
| `--scenario=parser` | tqdm / OOM / 缺包解析 |
| `--scenario=job-real` | 缺权重预检 |

## 设计系统

- `@openai/apps-sdk-ui` + Tailwind 4；
- 深灰亚克力：标题栏/侧栏 `.glass-thin`，内容 `.content-surface`，卡片 `.glass`；
- 无绿色、无蓝色渐变、无浅色主题；强调色 `#8ab6ff`；
- 控件 4–6 px 圆角、30–32 px 高、宽度随文字；标题栏居中应用名 + `dev/release` + 版本。
