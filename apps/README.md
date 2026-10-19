# apps/

Electron 桌面壳 + React 渲染层 + Web 服务。V1 只做编排，不做推理。

## 结构

```
apps/
  desktop/        Electron 主进程
    src/main.ts         生命周期、单实例锁、窗口（960×640，hiddenInset）
    src/preload.ts      contextBridge：invoke / subscribe（唯一暴露面）
    src/windows/        主窗口、Gradio WebContentsView、关于/日志窗口
    src/menu.ts         应用菜单、快捷键
    electron.vite.config.ts
  renderer/       React 19 + TS + Tailwind 4 + @openai/apps-sdk-ui
    src/app/            路由与布局（侧栏 + 内容区）
    src/pages/          home / instances / models / adapters / run / diagnostics / settings
    src/stores/         Zustand：instances、downloads、jobs、diagnostics、ui
    src/lib/client.ts   LauncherClient：ipc transport（桌面）/ http transport（Web）
  web/            Fastify：静态资源 + /api + /events（复用 packages/core）
```

## 设计系统

- `@openai/apps-sdk-ui`（MIT，React 18/19 + Tailwind 4，Radix 底座）；
- 全局样式：

```css
@import "tailwindcss";
@import "@openai/apps-sdk-ui/css";
@source "../node_modules/@openai/apps-sdk-ui";
```

- 强调色用 “Moss” `#2F6B4F`，其余沿用设计系统 token；
- 部分组件依赖 ChatGPT 宿主（`window.openai`），用 `PlatformProvider` 做最小 shim，
  不引入宿主 SDK；
- 深色跟随系统，独立 token，不简单反色。

## 窗口

| 项 | 值 |
| --- | --- |
| 默认尺寸 | 960 × 640（居中，不最大化） |
| 最小尺寸 | 840 × 560 |
| 记忆 | 位置/尺寸/最大化状态 |
| 标题栏 | macOS `hiddenInset`；Windows 原生 |
| 启动 | 先出骨架，环境扫描后台完成 |

## 通信

渲染层只依赖 `LauncherClient`：

```ts
interface LauncherClient {
  invoke<T>(channel: Channel, payload: unknown): Promise<T>
  subscribe(channel: EventChannel, cb: (e: unknown) => void): () => void
}
```

- 桌面：`ipcRenderer.invoke` → 主进程 zod 校验；
- Web：`fetch('/api/' + channel)` + `EventSource('/events')`；
- 同一套 React 代码，两种 transport，页面不感知差异。

## 打包

- macOS：electron-builder，arm64 + x64，签名 + 公证，dmg/zip；
- Windows：NSIS，长路径与 Defender 说明；
- 自动更新：读取 `release/manifest.json`，验签后下载安装；
- 安装包不内置权重，首次运行下载。

## 开发命令（M1 起）

```bash
pnpm install
pnpm dev            # electron-vite dev
pnpm build          # 构建 desktop + renderer
pnpm test           # vitest
pnpm e2e            # playwright + electron
```
