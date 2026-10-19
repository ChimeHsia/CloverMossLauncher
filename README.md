# CloverMossLauncher

MOSS-Image 的跨平台启动器 + 一套**不依赖 PyTorch** 的高性能推理引擎。

> 状态：**M0 · 架构立项**。本仓库当前是技术方案、接口契约与预算工具；推理代码尚未落地。
> 目录规划见 [docs/architecture.md](docs/architecture.md)，路线图见 [docs/roadmap.md](docs/roadmap.md)。

## 1. 为什么需要它

MOSS-Image（[OpenMOSS/MOSS-Image](https://github.com/OpenMOSS/MOSS-Image)，Apache-2.0）是目前少见的
"5B DiT + 强文字渲染 + JSON 布局控制" 开源模型。但官方发布形态有几个硬约束：

| 事实 | 数字 | 后果 |
| --- | --- | --- |
| DiT 参数 | 5.082 B（10.16 GB bf16） | 单个模型就超过多数轻薄本显存 |
| 文本编码器 | Qwen3.5-9B，8.393 B（16.79 GB bf16） | 比 DiT 还大，且是混合线性注意力 |
| VAE | FLUX.2 小型 VAE，8× 空间 + 2×2 patch | 1024² 解码需要分块，否则中间激活爆内存 |
| 全量权重 | 27.2 GB bf16 | 16 GB Mac 必须 int4 + 分阶段加载 |
| 官方采样 | 50 步 + CFG 3 | 100 次 5B 前向 ≈ 5.4 PFLOP / 张 1024² |

官方实现是 `diffusers` + `transformers` + `torch`。这带来三个产品级问题：

1. **部署面窄**：torch 装不进移动端，macOS 上只有 MPS，Windows 上绑定 CUDA 版本；
2. **内存不可控**：三件套同时常驻，16 GB 机器直接不可用；
3. **启动器体验差**：Python 进程、依赖冲突、首字延迟、没法定向优化。

CloverMossLauncher 要把这三件事分开解决：**引擎（C++/MNN）**、**启动器（桌面 + WebUI）**、
**训练器（可选，外部进程）**。

## 2. 三个组成部分

```
┌──────────────────────────────────────────────────────────────┐
│ apps/desktop  Tauri + React ──┐                              │
│ apps/web      同一套前端       ├── HTTP/SSE ── engine/ (C++) │
│ apps/mobile   iOS / Android ──┘        MNN: Metal/Vulkan/... │
└──────────────────────────────────────────────────────────────┘
                                                 │ 可选
                                      trainer bridge (外部 venv)
                                      KohakuMoss / 其它训练器
```

- **engine/**：C++17 核心。权重加载（safetensors/mmap）、量化、tokenizer、采样器、
  **逐 block 调度**（支持 CFG skip、DMD、LoRA、权重流式）、MNN 后端。
- **apps/**：桌面启动器（Tauri 2 + React）与 WebUI 共用一套前端；移动端后续复用同一 C++ 核心。
- **trainer bridge**：**不把训练器代码放进本仓库**（原因见
  [ADR-0002](docs/decisions/0002-trainer-backend.md)）。启动器只发现、配置、拉起外部训练环境，
  通过 JSON 事件流汇报进度。

## 3. 平台矩阵（目标）

| 平台 | 后端 | 状态 |
| --- | --- | --- |
| macOS (Apple Silicon) | MNN + Metal | M1 目标 |
| iOS | MNN + Metal | M5 |
| Android | MNN + Vulkan/OpenCL | M5 |
| Windows | MNN + Vulkan / CUDA | M4 |
| Linux | MNN + CUDA / Vulkan | M4 |

**MPS 不是产品运行时**，只作为数值 oracle 与兜底路径；理由与证据见
[ADR-0001](docs/decisions/0001-macos-runtime.md)。

## 4. 性能现实（先看数字再谈优化）

`python3 tools/budget.py` 的可复现估算，校准自公开 MLX 实测（M4 Max 1024²/50 步/CFG3 = 358 s）：

| 设备 | 512² 50步 | 512² 8步DMD | 1024² 50步 | 1024² 8步DMD |
| --- | ---: | ---: | ---: | ---: |
| M4 Max 40c（实测校准） | 90 s | 8 s | 5.8 min | 29 s |
| M1 Max 24c（实测校准） | 4.3 min | 22 s | 16.8 min | 83 s |
| M3 10c（估算） | 8.8 min | 45 s | 34.3 min | 2.8 min |
| RTX 4090（估算） | 25 s | 2 s | 1.6 min | 8 s |

结论：**50 步全质量档在 16 GB M3 上不可作为交互体验**；启动器必须原生支持 8 步 DMD /
few-step 适配器、分辨率档位和分阶段加载，而不是把 50 步当默认。

## 5. 仓库结构

```
docs/
  architecture.md          系统架构与模块边界
  model-notes.md           已核实的模型事实、采样器、数值约定
  roadmap.md               里程碑与验收标准
  decisions/               ADR：运行时选型、训练器集成
  research/upstream-survey.md  上游生态与可复用实现
contracts/
  engine-protocol.md       启动器 ↔ 引擎协议
  job.schema.json          生成任务 schema
  model-manifest.schema.json
tools/
  budget.py                算力/显存预算工具
engine/  apps/             代码目录（M1 起）
```

## 6. 快速开始（当前）

```bash
git clone https://github.com/CloverIris/CloverMossLauncher.git
cd CloverMossLauncher
python3 tools/budget.py --markdown   # 生成预算表
```

模型权重不随仓库分发，首次运行由启动器下载（Apache-2.0）。

## 7. 许可与第三方

- 本仓库代码：MIT（见 [LICENSE](LICENSE)）。
- MOSS-Image 权重与参考代码：Apache-2.0。
- 参考实现（mlx-serve、moss-image-swift）：MIT，仅作行为对照，不直接拷贝。
- **不包含** KohakuMossTrainer 代码；训练器是用户自备的外部环境（见 ADR-0002）。
