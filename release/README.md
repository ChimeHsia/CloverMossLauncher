# CloverMoss Launcher 开发版 0.1.0

这是 CloverMoss Launcher 的第一条公告。它来自仓库的 `release/README.md`，
启动器会把它渲染在首页与「公告」页。

## 现在可以用

- **环境体检**：系统、Metal/CUDA、内存、磁盘、Python、git 与网络，一次看清；
  还会按内存给出推荐档位（你这台 16 GB 的 M3 推荐 768² + 8 步 DMD）。
- **实例管理**：按 `OpenMOSS/MOSS-Image` 的分支与 commit 安装多个版本，
  每个实例固定 commit、互不影响；`main` HEAD 标记为稳定版。
- **运行时**：默认共享 Python 环境，可一键转为独立；依赖安装会实时显示日志。
- **模型与适配器**：官方权重、社区 int8/int4、8 步 DMD 的统一目录；
  下载走 HF 兼容缓存，支持断点与镜像，官方代码可直接命中。
- **深浅色**：跟随系统，也可以手动切换。

## 接下来

- **运行与进度**：薄 runner / 官方 Gradio，tqdm → 阶段进度条，stdout/stderr/stdin 全接管；
- **诊断**：OOM、缺包、网络等变成带解决方案的卡片，不弹窗循环；
- **WebUI**：浏览器打开同一套界面，手机也能看队列与画廊；
- **应用内更新**：读取这份清单，验签后下载安装。

## 已知限制

- **50 步很慢**：MOSS-Image 是 5B DiT + 8.4B 文本编码器。16 GB 的 Mac 上，
  1024²/50 步大约需要半小时；建议先用 **8 步 DMD + 768²**。
- **首次下载较大**：bf16 全量约 27 GB；16 GB 机器建议用社区 int8/int4 包。
- **仅 macOS arm64**：Windows 版本在后续里程碑。
- **尚未内置推理引擎**：当前只做安装、环境与资产管理；运行接入是 M4。

## 遇到问题

1. 先看「诊断」页（M4 上线）与实例详情里的运行时日志；
2. 导出诊断包（设置 → 诊断，M4）；
3. 反馈：[GitHub Issues](https://github.com/CloverIris/CloverMossLauncher/issues)。

---

*这条公告可以在首页点“不再显示”收起来；重要公告会重新出现。*
