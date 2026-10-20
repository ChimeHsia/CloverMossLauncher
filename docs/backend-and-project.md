# MossStudio 后端与 Project

- 状态：Job + Studio API 基座；WebUI 尚未实现；真实权重/运行时生成未验收
- 应用版本：`0.1.0`
- 事实来源：[status.md](status.md)

## 1. 后端进程

`src/backend/index.ts` 由 Electron main 通过 `utilityProcess.fork` 启动：

- 只听 `127.0.0.1` 的随机端口；
- 每次启动生成随机 Bearer token；
- 不直接跑 Python；通过 `process.parentPort` RPC 调 main 的 Supervisor；
- 因此 Job、终端日志、诊断、画廊仍由 main 统一拥有。

```
MossStudio 桌面 / Web shell
   │ HTTP / WS (token)
   ▼
utilityProcess backend.js
   │ parentPort RPC
   ▼
main Supervisor → runner.py / gradio_app.py
```

## 2. HTTP API

除 `/health` 外都需要：

```http
Authorization: Bearer <token>
```

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/health` | 健康检查，无需 token |
| GET | `/api/jobs` | Job 列表 |
| POST | `/api/jobs` | 提交 StartJobInput |
| GET | `/api/jobs/:id` | 查询 Job |
| POST | `/api/jobs/:id/cancel` | 取消 Job |
| GET | `/api/studio/bootstrap` | Project / Instance / 模型目录的 Studio 启动数据 |
| GET/POST | `/api/projects` | Project 列表/保存 |
| GET/DELETE | `/api/projects/:id` | Project 读取/删除 |
| GET | `/api/instances` | 实例列表 |
| GET | `/api/models` | 模型目录 |
| GET | `/api/gallery` | 画廊分页（cursor/limit/query/root） |

`POST /api/jobs` 的 body 与 `StartJobInput` 一致：

```json
{
  "instanceId": "moss-main-xxxx",
  "prompt": "a lighthouse at sunset",
  "negativePrompt": "",
  "width": 768,
  "height": 768,
  "steps": 8,
  "cfg": 1,
  "seed": 42,
  "profile": "dmd8",
  "workspace": "clover",
  "mode": "runner"
}
```

`workspace` 是 `official | clover`，缺省时 `mode: "gradio"` 归为 official，其余归为
clover。官方 Gradio 还可带启动级 `gradio` 配置（`model`/`profile`/`listen`/`port`/
`openMode` 等）；它不包含 steps/CFG/尺寸等页面内生成参数。

当前 `backend-job` 场景使用 `mode: "simulate"` 验证流程；真实 `mode: "runner"`
需要已安装 runtime 与 27 GB SFT 权重。

## 3. WebSocket

```
ws://127.0.0.1:<port>/ws?token=<token>
```

连接后收到 `hello`，之后收到：

```json
{ "type": "event", "channel": "event:job", "payload": { "...JobRecord": true } }
{ "type": "event", "channel": "event:job-log", "payload": { "...JobLogLine": true } }
```

主要给 Job/Studio API 集成使用；桌面 MossStudio 仍走 IPC，局域网 WebUI（ADR-0007）将复用同一 HTTP/WS。

## 4. Project 文件

路径：

```
<userData>/projects/<projectId>/
  project.json
  assets/
```

`project.json` 关键字段：

```json
{
  "schemaVersion": 1,
  "id": "project-xxxxxxxx",
  "name": "海报",
  "width": 1024,
  "height": 1024,
  "summary": { "caption": "...", "meta": ["poster"], "canvas": "single" },
  "layers": [
    {
      "id": "layer-...",
      "kind": "text",
      "caption": "标题",
      "text": "EXPLORE",
      "bbox": [128, 96, 896, 224],
      "visible": true,
      "locked": false,
      "opacity": 1
    }
  ],
  "prompt": "...",
  "negative": "...",
  "seed": 42,
  "steps": 8,
  "cfg": 1,
  "instanceId": "moss-main-...",
  "backgroundPath": "<project>/assets/background.png",
  "createdAt": "...",
  "updatedAt": "..."
}
```

- `layers` 是基础图层；`visible=false` 的图层不参与 layout 编译；
- `locked` 阻止画布拖动/缩放；`opacity` 只影响画布显示；
- 背景图在保存时复制到 `assets/`；其他资产重链/导入导出未做；
- 自动保存：打开/保存 Project 后，编辑变化 1.2 s 防抖保存；新建 Project
  需要先手动保存一次才开启自动保存；
- Project 与 Case 独立；Case 只是启动配置。

## 5. 已知边界

- 真实 backend 生成未验收（缺权重/runtime）；
- 局域网 WebUI 尚未实现；token/PIN、静态资源、响应式布局仍待做；WS 事件只完成基础广播；
- Project 完整回放/资产重链/导入导出未做；
- 后端 token 只保存在内存，应用重启重新生成；
- 打包时 `backend.js` 与 `ws` 依赖的打包路径待 M6 验证。
