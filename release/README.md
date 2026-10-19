# CloverMoss Launcher 开发版 0.1.0

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
  **“开始生成”尚未接任务**，等 Clover 常驻后端。
- **画廊**：启动器侧栏全局入口，也可添加任意本地文件夹；分页加载、详情、
  元数据与“用作布局底图”。
- **背景**：内置 16:9 深灰占位图，设置里可换本地图片；背景铺满所有页面与终端。
- **训练**：训练页可部署 KohakuMossTrainer、按 commit 建版本、安装环境
  （环境安装代码已接，未在 CUDA 验证）；SSH host 可测试，远端 mirror/train 代码已接
  （仅 fake ssh 验证，真实 host 未验收）；
  独立 Kohaku Trainer 窗口负责表单/命令预览/doctor；CUDA 主机上走训练路径（代码已接，真实 CUDA 未验收），
  并把 step/loss 送进共享终端；SSH host 可测试，远端执行代码路径已接，真实 host 下一阶段验收。
  macOS 无 CUDA，不能真实训练。
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
3. **Clover 常驻后端 + Project/图层**；
4. **队列完整重启验收、Gradio/27 GB、设备维护**；
5. **WebUI + 应用内更新 + 打包**。

## 已知限制

- **50 步很慢**：MOSS-Image 是 5B DiT + 8.4B 文本编码器；16 GB Mac 上
  1024²/50 步可能接近半小时。**DMD 8 步 profile 当前只透传，仍走官方 pipeline**，
  还没有真正的 8 步采样器；可以先用 768² + 较少步数。
- **首次下载较大**：bf16 全量约 27 GB；16 GB 机器建议社区 int8/int4 包。
- **Windows 未实机验证**。
- **尚未内置推理引擎**：运行官方 Python；真实权重链路需在足够磁盘的机器上验收。
- **Clover 后端/Project 未实现**：创作窗口只能编辑，不能生成。

## 遇到问题

1. 先看「诊断」页与实例详情里的运行时日志；
2. 在诊断页导出诊断信息；
3. 反馈：[GitHub Issues](https://github.com/CloverIris/CloverMossLauncher/issues)。

---

*这条公告可以在首页“不再显示”收起来；重要公告会重新出现。*
