# 模型事实与数值约定

> 所有数字来自公开 checkpoint 的 config/index 与上游代码，标注了来源。
> 预算表由 `python3 tools/budget.py --markdown` 生成。

## 1. 组件

| 组件 | 实现 | 参数 | bf16 | 关键结构 |
| --- | --- | ---: | ---: | --- |
| DiT | `MOSSImageTransformer` | 5.082 B | 10.16 GB | 42 层 single-stream，dim 3072，FFN 8192，24 头 |
| 文本编码器 | `Qwen3_5Model` | 8.393 B | 16.79 GB | 32 层：24 linear attention + 8 full，hidden 4096 |
| VAE | `AutoencoderKLFlux2` | ~0.125 B | 0.25 GB | 32 latent ch，8× 空间，2×2 patch → 16× |
| 调度器 | `MOSSImageScheduler` | — | — | Euler，shift 5，1000 步训练网格 |

来源：
[transformer/config.json](https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base/raw/main/transformer/config.json)、
[text_encoder/config.json](https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base/raw/main/text_encoder/config.json)、
[vae/config.json](https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base/raw/main/vae/config.json)、
两个 `*.index.json` 的 `metadata.total_size`。

注意 VAE 配置里 `latent_channels: 32`，而 DiT 的 `latent_channels: 128`：
二者不矛盾，**128 = 32 × 2 × 2 patchify**。DiT 的 H/W 是像素 /16。

## 2. DiT 结构（逐项核实）

- `video_embedder`：Linear 128 → 3072，每个 /16 网格点一个 token；
- `text_embedder`：Linear 4096 → 3072 + 2 个 `_TextBlock`（fused qkv、qk-norm、
  RoPE、SiTU FFN、**无** modulation）；
- `time_embedding`：sinusoid(256) → Linear → SiLU → Linear（fp32 权重）；
- `shared_block_modulation`：**一个** Linear 3072 → 6×3072，42 层共用；
- `layers.0..41`：joint block，序列 = `[image tokens ; text tokens]`；
  RMSNorm + modulation → q/k/v → per-head qk RMSNorm + 4 轴 RoPE → attention →
  gated residual → RMSNorm + modulation → `ffn_up_gate`（前半 up，后半 gate）→
  SiTU → `ffn_down` → gated residual；
- `final_norm_video` + `video_head_modulation` + `final_linear_video`（3072 → 128）；
- 输出是 **flow velocity**：`v = noise - x0`，sigma ∈ [0,1]，1 为纯噪声。

**SiTU**：`(4·tanh(g/4)·sigmoid(g)) · (25·tanh(u/25))`，无参数，可分解为
sigmoid/tanh/mul，MNN 直接支持。

**RoPE（4 轴）**：坐标 `(r, f, h, w)`，图像 token 的 `r=0`、`f=text_len`、
`h,w` 居中（减 `(size-1)/2`）；文本 token 的 `f=position`、其它为 0。
频带数 = `head_dim/8` = **16**；每个坐标 16 个频率 → `sin/cos` 拼成 32，
四轴共 128 = head_dim。**在 host 侧预计算**，作为图输入，避免图内动态三角与网格生成。

## 3. 序列长度与算力

| 分辨率 | image tokens | seq（text 256） | 单次前向 |
| --- | ---: | ---: | ---: |
| 512² | 1024 | 1280 | 13.9 TF |
| 768² | 2304 | 2560 | 29.4 TF |
| 1024² | 4096 | 4352 | 54.0 TF |
| 1280×768 | 3840 | 4096 | 50.3 TF |
| 1024×1376 | 5504 | 5760 | 75.7 TF |

注意 attention 占比随分辨率平方增长：1024² 时占总算力 18%，1376² 时 23%。
Flash/分块 attention 是 1024² 以上的必选项。

端到端（含 TE 与 VAE）：

| 设备 | 512² 50步 | 512² 8步 | 1024² 50步 | 1024² 8步 |
| --- | ---: | ---: | ---: | ---: |
| M4 Max 40c（实测校准） | 90 s | 8 s | 5.8 min | 29 s |
| M1 Max 24c（实测校准） | 4.3 min | 22 s | 16.8 min | 83 s |
| M3 10c（估算） | 8.8 min | 45 s | 34.3 min | 2.8 min |
| RTX 4090（估算） | 25 s | 2 s | 1.6 min | 8 s |

校准点：M4 Max + MLX，1024²/50 步/CFG3/bf16 = **358 s**（mlx-serve PR #908）。
该结果反推有效算力 ≈ 15.3 TFLOP/s，与预算模型一致。

## 4. 内存

| 档位 | TE | DiT | VAE | 常驻权重 |
| --- | --- | --- | --- | ---: |
| 8 GB | int4 | int4 + block 流式 | int8 | ~7.0 GB |
| 16 GB | int4 | int8 | int8 | ~9.8 GB |
| 24 GB | int8 | int8 | int8 | ~13.6 GB |
| 48 GB+ | bf16 | bf16 | bf16 | ~27.5 GB |

**分阶段是硬要求**：TE 编码完即可卸载，再加载 DiT；解码前再卸 DiT。
16 GB 机器上三件套同时常驻（bf16 = 27.2 GB）必然 swap。

## 5. 采样器

### base（官方）

```
sigma grid: lower = shift/(1000+shift-1)
values = linspace(1, lower, N)
sigmas = shift*values / (1 + (shift-1)*values)
再吸附到 1000 步训练网格的最近点，去重
```

- 默认 50 步、CFG 3、`shift=5`；
- 负分支 **跳过 block 22**（不是少算 CFG，而是用 skip 预测替代负分支预测，
  仍保持 2 次前向）；
- CFG 合并必须在 **fp32** 做（上游注释明确）；
- 初始噪声 fp32 采样，不能"先 bf16 再提升"。

### dmd8（社区蒸馏，可选档）

[lodestones/MOSS-Image-SFT-8-steps-dmd](https://huggingface.co/lodestones/MOSS-Image-SFT-8-steps-dmd)
（Apache-2.0）：data-space DMD，8 次前向、无 CFG、fp32。

```python
Q, codes = load("dataspace.safetensors")      # Q: [128,128], codes: [8]
z = randn(1,128,H//16,W//16, fp32); x0 = zeros_like(z)
for r in range(8):
    x = z + einsum("oc,bchw->bohw", Q, x0)
    v = dit(x, codes[r], embeds, mask)        # fp32
    x0 = z - v
decode(x0)
```

配套 `time_embedding.safetensors` 是**替换**（含 `shared_block_modulation.bias`、
`video_head_modulation.bias`），必须 fp32；`lora.safetensors` 是 rank 128 的
delta。三者缺一不可。

## 6. 数值约定（必须照抄，否则画质漂移）

| 位置 | 精度 | 原因 |
| --- | --- | --- |
| timestep sinusoid | fp64 计算 → fp32 | 上游训练如此 |
| time_embedding / modulation | fp32 权重与输出 | 小模块，误差会被 42 层放大 |
| CFG 合并 | fp32 | 上游注释：只转最终速度会保留舍入误差 |
| 初始 latent | fp32 | bf16 噪声无法恢复精度 |
| VAE | fp32（上游 `force_upcast`） | 解码对精度敏感；我们先用 fp16 + 分块，做 LPIPS 对照 |
| DMD | 全 fp32 | 蒸馏 delta 小于 bf16 舍入 |

## 7. 权重布局

| 来源 | 键 | 处理 |
| --- | --- | --- |
| HF diffusers `transformer/` | `layers.N.proj.q.weight` … | 直接映射 |
| ComfyUI 单文件 | 无前缀或 `model.diffusion_model.` | 去前缀；`proj.qkv` 拆 q/k/v |
| Comfy-Org repack | fused qkv | 拆分后加载 |
| KohakuMoss 单文件 | 裸键 | 可直接读（格式公开） |

`rope.bands` 是派生 buffer，可忽略重算。

## 8. 已知坑

1. **VAE 内存**：1024² 不分块会 OOM（实测 25.5 GiB 中间激活）；
2. **文本编码器**：`encode_prompt` 对每条 prompt 单独前向，padding 会污染
   Qwen GDN 的线性注意力状态——引擎必须按真实长度分桶，不能整批 padding；
3. **batch**：上游按样本循环做 DiT（每个样本用自己的 text mask），
   批量生成时不要简单 stack；
4. **CFG + skip**：skip 只在 `slg_start..slg_stop` 区间生效，默认全区间；
5. **分辨率**：必须是 16 的倍数，否则直接报错（上游如此）。
