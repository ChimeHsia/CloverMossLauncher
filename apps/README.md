# apps/

V1 采用单包 `apps/desktop`：Electron 主进程 + preload + React 渲染层一起构建，
先保证能跑、能验证；M5 做 WebUI 时再把渲染层与服务层抽出。

## 结构

```
apps/desktop/
  electron.vite.config.ts
  src/main/                 Electron 主进程
    index.ts                生命周期、窗口、smoke / screenshot / scenario
    ipc.ts                  ipcMain.handle + zod 校验 + 事件
    lib/                    paths / run / events
    services/               env, network, git, runtimes, instances, models, updates, settings
  src/preload/index.ts      contextBridge：invoke / on
  src/renderer/
    index.html
    src/main.tsx
    src/App.tsx             HashRouter + 侧栏布局
    src/pages/              Home / Instances / InstanceDetail / Models / Settings
    src/components/         layout（Sidebar / Topbar）+ ui（Card / Pill / Modal / Toast / Progress）
    src/store.ts            Zustand
    src/lib/                api / format / i18n
    src/styles.css          Tailwind 4 + Apps SDK UI + Moss token
  src/shared/               types / channels / schemas
  out/                      构建产物（gitignored）
```

## 运行

```bash
pnpm install
pnpm dev            # electron-vite dev
pnpm build          # main + preload + renderer
pnpm typecheck
```

开发数据在仓库 `.dev-data/`（已忽略）。部分 CI/harness 会设置
`ELECTRON_RUN_AS_NODE=1`，启动前需临时去掉：

```bash
env -u ELECTRON_RUN_AS_NODE pnpm --filter @clover/desktop exec electron . --smoke
```

## 开发自检

| 命令 | 作用 |
| --- | --- |
| `... electron . --smoke` | 无窗口：环境报告 + 公告 + 目录，打印 JSON 后退出 |
| `... electron . --scenario=create` | 克隆镜像、创建首个实例（共享 runtime） |
| `... electron . --scenario=second` | 旧 commit 再建一个实例，验证共享 runtime 复用 |
| `... electron . --scenario=install` | 安装 torch / diffusers / transformers 依赖 |
| `... electron . --scenario=download-test` | 下载 12 MB HF 测试仓库，验证缓存布局 |
| `... electron . --screenshot` | 生成首页/实例/模型/设置/浅色截图到 `.dev-data/` |

`--scenario` 与 `--screenshot` 仅开发用；发布包不暴露入口。`--smoke` 会加
`--no-sandbox`（harness 的 Chromium 沙箱无法初始化），正常启动不加。

## 设计系统

- `@openai/apps-sdk-ui`（MIT，React 18/19 + Tailwind 4，Radix 底座）；
- 全局样式：

```css
@import "tailwindcss";
@import "@openai/apps-sdk-ui/css";
@source "../../../node_modules/@openai/apps-sdk-ui";
```

- 强调色 “Moss” `#2f6b4f`；primary solid 的 token 在 `styles.css` 里覆盖；
- Apps SDK UI 会重置 Tailwind 默认调色板，`styles.css` 里显式补了
  sky / amber / emerald / red / neutral 的少量色阶；
- 深色通过 `[data-theme="dark"]`，跟随系统。

## 窗口

| 项 | 值 |
| --- | --- |
| 默认尺寸 | 960 × 640（居中，不最大化） |
| 最小尺寸 | 840 × 560 |
| 标题栏 | macOS `hiddenInset`；Windows 原生 |
| 启动 | 先出窗口，环境扫描后台完成 |

## 通信

渲染层只依赖 `lib/api.ts` 的 `call` / `onEvent`：

- 主进程每个 channel 都用 zod 校验入参；
- 统一返回 `{ ok, data } | { ok, error }`；
- 进度类事件单向推送（`event:download`、`event:runtime-log`、`event:instances-changed`）；
- 渲染层用 Zustand 归约，页面不直接接触 `ipcRenderer`。

## 打包（M6）

- macOS：electron-builder，arm64 + x64，签名 + 公证，dmg/zip；
- Windows：NSIS，长路径与 Defender 说明；
- 自动更新读取 `release/manifest.json`，验签后下载安装；
- 安装包不内置权重。

## M5 拆分计划

```
apps/desktop/src/main/services  ->  packages/core
apps/desktop/src/shared         ->  packages/contracts
apps/desktop/src/renderer       ->  apps/renderer
apps/web                        ->  Fastify + 同一 renderer + SSE
```

拆分时保持 `call` / `onEvent` 的 transport 抽象不变（IPC ↔ HTTP）。
