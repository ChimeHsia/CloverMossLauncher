# CloverMoss Launcher 内测开始

这是 CloverMoss Launcher 的第一条公告。它来自仓库的 `release/README.md`，
启动器会把它渲染在首页与「公告」页。

## 这个版本能做什么

- **环境体检**：启动时检查系统、Metal/CUDA、内存、磁盘、Python、git 与网络，
  并给出适合你机器的分辨率/步数建议；
- **实例管理**：按 `OpenMOSS/MOSS-Image` 的分支与 commit 安装多个版本，
  互不打架；`main` HEAD 标记为稳定版；
- **运行时**：默认共享 Python 环境，可一键转为独立；不用预装 Python；
- **模型与适配器**：官方权重、社区量化包、LoRA/DMD 的统一下载与管理；
- **进度翻译**：把 tqdm 进度条变成启动器里的百分比与阶段；
- **错误诊断**：OOM、缺包、网络等问题变成带解决方案的卡片，而不是终端里的 traceback；
- **WebUI**：浏览器打开同一套界面，手机也能看队列与画廊；
- **更新与公告**：就是你现在看到的这套机制。

## 已知限制

- **50 步很慢**：MOSS-Image 是 5B DiT + 8.4B 文本编码器。16 GB 的 Mac 上，
  1024²/50 步大约需要半小时；建议先用 **8 步 DMD + 768²**（预计 1–3 分钟）。
- **首次下载较大**：bf16 全量约 27 GB；16 GB 机器建议用社区 int8/int4 包。
- **仅 macOS arm64**：Windows 版本在下一个里程碑。
- **尚未内置推理引擎**：当前通过官方 `gradio_app.py` 或随应用分发的薄 runner 运行；
  自研引擎是 V2 的事。

## 遇到问题

1. 先看「诊断」页，多数错误有对应的解决按钮；
2. 仍然不行，导出诊断包（设置 → 诊断 → 导出），附上你的设备信息与复现步骤；
3. 反馈：[GitHub Issues](https://github.com/CloverIris/CloverMossLauncher/issues)。

---

*这条公告可以在首页点“不再显示”收起来；重要公告会重新出现。*
