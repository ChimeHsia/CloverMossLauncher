# CloverMoss Launcher 0.1.0

> 本文件由 `node tools/release-md.mjs` 从 `release/manifest.json` 与
> `release/models.json` 生成；请勿直接手改。发布时把本文件作为 GitHub Release
> 的 `release.md` 资产上传。

- 通道：**stable**
- 发布：2026-10-19T02:00:00Z
- 最低版本：0.1.0
- 模型目录：2026-10-19T02:00:00Z · `sha256:6b4b0c781588…`

## 安装包

_当前发布未附带安装包。_

## 模型目录

| ID | 名称 | 仓库 | 角色 | 精度 | 大小 | 许可 | 标签 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `moss-sft` | MOSS-Image SFT | `OpenMOSS-Team/MOSS-Image-SFT` | full | bf16 | 27.2 GB | Apache-2.0 | `official` `sft` `recommended` |
| `moss-base` | MOSS-Image Base | `OpenMOSS-Team/MOSS-Image-Base` | full | bf16 | 27.2 GB | Apache-2.0 | `official` `base` |
| `moss-sft-int8` | MOSS-Image SFT INT8 (社区) | `Abiray/MOSS-Image-SFT-INT8-convrot` | dit | int8 | 5.4 GB | Apache-2.0 | `community` `quantized` `int8` `low-memory` |
| `moss-sft-int4` | MOSS-Image SFT INT4 (社区) | `toxicdog/MOSS-Image-SFT-INT4-ConvRot-ComfyUI` | dit | int4 | 3.0 GB | Apache-2.0 | `community` `quantized` `int4` `low-memory` `comfy` |
| `moss-comfy-repack` | MOSS-Image (Comfy-Org 重打包) | `Comfy-Org/MOSS-Image` | full | mixed | 27.0 GB | Apache-2.0 | `community` `comfy` |

## 适配器

| ID | 名称 | 仓库 | 类型 | 基座 | 大小 | 许可 | 文件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dmd8-sft` | 8-step DMD (SFT) | `lodestones/MOSS-Image-SFT-8-steps-dmd` | dmd | moss-sft | 1.3 GB | Apache-2.0 | `lora.safetensors` `time_embedding.safetensors` `dataspace.safetensors` |
| `dmd8-base` | 8-step DMD (Base) | `lodestones/MOSS-Image-Base-8-steps-dmd` | dmd | moss-base | 1.3 GB | Apache-2.0 | `lora.safetensors` `time_embedding.safetensors` `dataspace.safetensors` |

## 公告

### CloverMoss Launcher 内测开始

> info · 2026-10-19T02:00:00Z

详见下方「发布说明」。

## 发布说明

这是 CloverMoss Launcher 的内测公告。它来自仓库的 `release/README.md`，
启动器会把它渲染在首页与「公告」页。

> 开发版能力边界以 [docs/status.md](../docs/status.md) 为准。代码路径存在但未
> 在真实权重/NVIDIA/Windows 上验收的功能，下面会明确标出。

## 现在可以用

- **四窗口**：启动器负责启动与监视；创作窗口负责画布/layout；终端看
  stdout/stderr；Kohaku Trainer 独立负责训练配置。
- **环境体检**：系统、Metal/CUDA、内存、磁盘、Python、git、uv 与网络一次看清，
  并按内存给推荐档位。
- **实例管理**：按 `OpenMOSS/MOSS-Image` 的分支与 commit 建 worktree，
  每个实例固定完整 SHA、互不影响；没有 tag，稳定版按 `main` HEAD 或 manifest
  的 `recommended_commit` 标记。
- **运行时**：默认共享 venv，可一键转独立；依赖按 Python + 平台 + 依赖锁哈希
  复用；安装日志实时显示。
- **模型/适配器**：官方权重、量化包、DMD、常用 LoRA 的统一目录；下载走
  HF 兼容缓存，支持 Range 续传、LFS sha256、暂停/继续与镜像。
- **启动条**：固定在首页底部、固定宽度居中；Case、后端、实例、设备、档位、
  高级、启动；运行后变为停止/终端/打开界面，并在上方插入新的启动条。
- **运行栈**：运行中 Case 收在下方，可折叠、按名称/启动时间排序；同设备默认排队。
  Case 配置写 `cases.json`；队列行写 `launch-queue.json`，queued 保留、running 重启标 failed。
- **OOBE**：没有可启动实例时默认出现，检查实例/运行时/模型三行，可本次跳过。
- **创作台**：Prompt、尺寸/步数/CFG/Seed；画布可框选人物、物体、文字区域；
  按官方 layout JSON 编译成 `abs_centralized + yxyx` 并插入 Prompt。
  Project 自动保存；**“开始生成”已接独立 HTTP/WS Clover 后端**，提交 Supervisor/终端。
- **画廊**：启动器侧栏全局入口，也可添加任意本地文件夹；分页加载、详情、
  元数据与“用作布局底图”。
- **背景**：内置 16:9 深灰占位图，设置里可换本地图片；背景铺满所有页面与终端。
- **训练**：训练页可部署 KohakuMossTrainer、按 commit 建版本、安装环境
  （环境安装代码已接，未在 CUDA 验证）；SSH host 可测试，远端 mirror/train 代码已接
  （仅 fake ssh 验证，真实 host 未验收）；
  独立 Kohaku Trainer 窗口负责表单/命令预览/doctor；CUDA 主机上走训练路径（代码已接，真实 CUDA 未验收），
  并把 step/loss 送进共享终端；SSH host 可测试，远端执行代码路径已接，真实 host 下一阶段验收。
  macOS 无 CUDA，不能真实训练。
- **设备维护**：设置内可启用/禁用/重命名设备；启动条过滤不可用设备。
- **通知中心**：右上角单矩形抽屉，默认打开；公告 + 应用内通知。
- **诊断**：OOM、缺包、网络、缺权重等变成带解决方案的卡片；同一错误不会反复弹窗。
- **终端**：独立窗口，左侧 Cases，右侧 xterm，支持 stdin、停止/重启；
  推理与训练任务共用。
- **界面**：中性深灰亚克力，无绿色、无深蓝底；标题栏居中应用名 + dev/release
  + 版本；启动器侧栏无 Logo。

## 当前验证边界

- 本机是 Apple M3 / 16 GB，macOS arm64；Windows 未实机验证；
- 没有 27 GB SFT 权重，官方 Gradio 只验证了预检代码路径；
- 没有 NVIDIA CUDA，真实 `kogine` 训练未跑；训练 Job/loss 用模拟输出验证；
- Trainer 环境安装、数据缓存、导出/采样没有在真实 CUDA 环境执行（fake uv/ssh 只验证流程）；
- SSH 的 host probe、远端 mirror/训练代码已接，但只有 fake ssh 验证，真实 host 未验收。

## 接下来

1. **SSH 真实 host 验收**：连接、host key、远端 mirror/worktree/venv、远端 Job/日志；
2. **真实 CUDA 训练验收 + 导出/采样执行**；
3. **Clover 真实生成验收 + Project/图层 UI 收尾**；
4. **队列完整重启验收、Gradio/27 GB、设备维护**；
5. **签名安装/electron-updater、打包/公证**；Creator 不做浏览器版（ADR-0004）。


## 已知限制

- **50 步很慢**：MOSS-Image 是 5B DiT + 8.4B 文本编码器；16 GB Mac 上
  1024²/50 步可能接近半小时。**DMD 8 步 profile 当前只透传，仍走官方 pipeline**，
  还没有真正的 8 步采样器；可以先用 768² + 较少步数。
- **首次下载较大**：bf16 全量约 27 GB；16 GB 机器建议社区 int8/int4 包。
- **Windows 未实机验证**。
- **尚未内置推理引擎**：运行官方 Python；真实权重链路需在足够磁盘的机器上验收。
- **Clover 真实生成未验收**：缺 27 GB 权重/运行时；Project 完整回放/资产重链未做。

## 遇到问题

1. 先看「诊断」页与实例详情里的运行时日志；
2. 在诊断页导出诊断信息；
3. 反馈：[GitHub Issues](https://github.com/CloverIris/CloverMossLauncher/issues)。

---

*这条公告可以在首页“不再显示”收起来；重要公告会重新出现。*

```json clover-release
{
  "schema_version": 2,
  "app": {
    "name": "CloverMoss Launcher",
    "channel": "stable",
    "version": "0.1.0",
    "min_supported": "0.1.0",
    "published_at": "2026-10-19T02:00:00Z",
    "notes_url": "https://github.com/CloverIris/CloverMossLauncher/releases"
  },
  "installers": [],
  "home": {
    "chapter": "万象初绘",
    "title": "一念落纸上，万象入画来。",
    "subtitle": "选好工作台、实例与设备，开始今天的创作。"
  },
  "catalog": {
    "updated_at": "2026-10-19T02:00:00Z",
    "models_url": "https://raw.githubusercontent.com/CloverIris/CloverMossLauncher/main/release/models.json",
    "models_sha256": "6b4b0c781588c8e32178b057fa521626e6ff75632e96fb254a9bf4fbbfe6d358"
  },
  "announcements": [
    {
      "id": "2026-10-launch",
      "level": "info",
      "title": "CloverMoss Launcher 内测开始",
      "body_url": "https://raw.githubusercontent.com/CloverIris/CloverMossLauncher/main/release/README.md",
      "starts_at": "2026-10-19T02:00:00Z",
      "ends_at": null,
      "dismissible": true,
      "pinned": true,
      "action": {
        "label": "查看更新",
        "kind": "check_update"
      }
    }
  ]
}
```
