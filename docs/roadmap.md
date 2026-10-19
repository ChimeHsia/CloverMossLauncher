# 路线图

> 原则：每个里程碑都有**可测的验收标准**，不达标就不进入下一阶段。
> 估算按 1 名全职工程师计，仅供排期参考。

## M0 · 立项与可行性（1 周）

**交付**

- [x] 仓库初始化、README、架构文档、ADR-0001/0002、预算工具；
- [ ] MNN 在 M3 上的 block 级微基准（`docs/benchmarks/m0-mnn-spike.md`）；
- [ ] 单 block ONNX → MNN 转换脚本原型（`tools/convert/`）；
- [ ] 与 PyTorch MPS 的同 block 对照数据。

**验收**

- 能回答"5B DiT 在 M3 上单次前向要多久、峰值内存多少"；
- 若 block 有效算力 < 1.5 TFLOP/s，重开 ADR-0001（启用 MLX 快路径）。

## M1 · 引擎内核：DiT + VAE（3 周）

**范围**

- `engine/` C++17 骨架、CMake、MNN submodule（固定 tag）；
- safetensors mmap 读取、`clover.json` 清单、权重布局转换（HF/ComfyUI）；
- 42 block 调度、CFG + block-22 skip、4 轴 RoPE（host 预计算）、fp32 调制；
- `ref` 后端（CPU 正确性）+ `mnn` 后端（Metal）；
- VAE 分块解码 + BN 反归一化 + unpatch；
- CLI：`clovermoss generate --prompt ... --steps 20 --size 512`（文本嵌入由夹具提供）。

**验收**

- 与官方 diffusers 的逐层 parity：单 block cos ≥ 0.9999（fp32）、端到端 LPIPS ≤ 0.02；
- M3 16 GB，512²/20 步，int8 权重，**≤ 4 min**，峰值 RSS ≤ 12 GB；
- 取消请求 100 ms 内生效。

## M2 · 文本编码器与端到端（3 周）

**范围**

- Qwen3.5-9B 导出（MNN-LLM 或 encoder-only），int4；
- tokenizer（Qwen BPE）与 chat template；
- 文本长度分桶（128/256/512/1024/2048/4096）；
- 组件 staging（TE 卸载 → DiT 加载 → VAE）；
- 首次运行模型下载器（HF/ModelScope 镜像、断点续传、哈希校验）。

**验收**

- M3 16 GB，512²/20 步，**≤ 5 min**，峰值 ≤ 14 GB；
- 同一 prompt/seed 与官方输出 LPIPS ≤ 0.03；
- 冷启动（含 TE 加载）≤ 20 s，热启动 ≤ 5 s。

## M3 · 启动器 v0.1（4 周）

**范围**

- Tauri 2 + React：模型库、生成、队列、画廊、设置；
- 本地 HTTP + SSE 协议（`contracts/`）；
- LoRA 加载（kohya/ComfyUI 键），strength 实时调整；
- 8 步 DMD profile（独立采样器 + fp32 time embedding）；
- WebUI 模式（同一前端，远程连接）；
- 打包：macOS universal（arm64 + x86_64 的 MNN 后端按需）、公证。

**验收**

- 一键安装 → 下载 → 生成，全流程无终端；
- 队列可取消/重排，崩溃后可恢复未完成任务；
- 512²/8 步在 M3 上 ≤ 90 s；
- 画廊内嵌元数据可完整复现（同 seed 同图）。

## M4 · 1024² 与多平台（4 周）

**范围**

- 1024²：分块 attention、VAE 分块调优、int4 DiT 选项；
- Windows（Vulkan/D3D12）+ Linux（CUDA）；
- 性能面板：tokens/s、TFLOPS、峰值内存、降档记录；
- 权重流式（8 GB 档）；
- 自适应 profile（按设备内存/带宽自动选档）。

**验收**

- M3 16 GB：1024²/8 步 ≤ 4 min，峰值 ≤ 15 GB；
- RTX 3060 12 GB：1024²/50 步 ≤ 6 min；
- 同 seed 跨平台输出 LPIPS ≤ 0.05（允许合理的后端差异）。

## M5 · 移动端（6 周+）

**范围**

- iOS（Metal）/ Android（Vulkan/OpenCL）壳 + 同一 C++ 核心；
- int4 权重、mmap、后台任务、热管理；
- 分辨率档 512²/768²，8 步优先；
- 模型按需下载（App 不内置 27 GB）。

**验收**

- iPhone 16 Pro：512²/8 步 ≤ 3 min，峰值内存 ≤ 6 GB；
- 连续 10 张不触发系统杀进程；
- 离线可用。

## M6 · 训练器桥接（2 周）

**范围**

- 环境发现与体检（外部 venv，KohakuMoss 或其它）；
- `job.json` → NDJSON 事件；
- 训练配置编辑器（数据集、分辨率、rank、显存档）；
- 产物自动登记为适配器；
- GPU 互斥与队列优先级。

**验收**

- 在 Windows + RTX 4090 上完成一次 LoRA 训练并直接用于生成；
- 训练中断可续（依赖上游 checkpoint）；
- 启动器不打包、不修改训练器代码。

## 里程碑依赖

```
M0 ──> M1 ──> M2 ──> M3 ──> M4 ──> M5
                       └────> M6（可与 M4/M5 并行）
```

## 明确不做（本路线图内）

- 自研训练内核；
- img2img / edit（等上游）；
- 云端多租户服务；
- 模型 marketplace 后端。
