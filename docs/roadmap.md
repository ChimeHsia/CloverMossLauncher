# 路线图

- 更新：2026-10-19
- 应用版本：`0.1.0`（开发版）
- 基线：[status.md](status.md)
- 当前判断：训练器本机基座代码已完成（真实 CUDA 未验收）；下一步不是继续堆训练 UI，而是打通
  **SSH 远端执行** 与 **真实 CUDA 验收**，同时把 Clover 常驻后端/Project 拉回主线。

> 这里只列**尚未完成**的工作和验收条件。已完成能力见 [status.md](status.md)。
> 不使用虚构日期；按 P0/P1/P2 和依赖关系排。

## 0. 当前基线

已具备：

- 四窗口：启动器 / 创作 / 终端 / Kohaku Trainer；
- 环境、实例、运行时、模型、下载、画廊、诊断；
- Supervisor + runner + 终端；推理/训练共用 Job 表；
- Trainer 仓库/版本/环境/训练窗口/本机训练 Job；
- SSH host CRUD 骨架。

未具备：

- SSH 远端执行；
- 真实 CUDA 训练与导出/采样；
- Clover 常驻后端、Project/图层；
- 队列落盘、WebUI、更新安装、打包。

## 1. P0 · SSH 远端训练

**目标**：Mac 上管 Linux/Windows NVIDIA 训练机，训练日志/step/loss 回到共享终端。

范围：

1. 系统 `ssh` 连接：host/user/port/identityFile/ssh config；
2. host key 校验与错误诊断（首次连接、密钥、权限、超时）；
3. 远端 `trainerRoot` 检查：目录、git、uv、Python、NVIDIA；
4. 远端 mirror/worktree：复用 trainerGit 逻辑，但命令经 ssh 执行；
5. 远端 venv/环境：lock hash、安装、doctor；
6. 远端训练：生成远端脚本、启动/停止、stdout/stderr/step/loss 回传；
7. 远端 host 与本地 Job 的映射；
8. 远端路径不做自动上传，使用用户指定路径。

验收：

- 从 SSH host 列表测试连接成功/失败都有可解释诊断；
- 在远端创建 trainer 版本并完成 `kohakumoss-doctor`；
- 远端启动训练，终端出现 `step N loss=...`；
- 停止/取消可用，JS 进程退出后远端无孤儿进程；
- 本地/远端训练 Job 在终端可区分 host。

## 2. P0 · 真实 CUDA 训练与训练收尾

**目标**：在 NVIDIA 机器上跑一次真实 LoRA 训练，闭合训练窗口。

范围：

1. 安装 trainer 环境（CUDA torch、kohakumoss、kogine）；
2. 用小数据集跑通 config → cache → train → checkpoint；
3. 验证 step/loss 解析、失败诊断、取消；
4. 导出/采样真实执行（不是命令预览）；
5. loss 曲线/关键指标展示（不要求完整 TensorBoard）；
6. 训练完成后登记输出目录/适配器（与模型库交接）。

验收：

- 真实训练至少跑到 checkpoint；
- 日志、loss、退出状态与真实进程一致；
- 导出产物可被下游读取；
- 失败（OOM/依赖/数据格式）有诊断卡片与原始日志。

## 3. P1 · Clover 常驻后端

**目标**：创作窗口不再只是表单，能真正生成并进入 Job/画廊。

范围：

1. 本地常驻 HTTP/WS 服务（进程生命周期、端口、健康检查）；
2. 创作窗口连接服务，提交 prompt/layout/尺寸/seed；
3. Job 进入现有 Supervisor/终端/画廊；
4. 服务日志进终端；
5. 失败与取消走现有诊断。

验收：

- 创作窗口“开始生成”不再提示下一轮；
- 结果进画廊并带元数据；
- 终端可看服务与生成日志；
- 服务异常退出有诊断和重启策略。

## 4. P1 · Project 持久化与图层

**目标**：Project 与 Case 解耦；创作可保存/重开。

范围：

1. Project 文档格式（画布、图层、区域、提示词、资产引用）；
2. 本地持久化与版本兼容；
3. 图层增删/排序/显隐/锁定；
4. Project 与 Case/模型的引用关系；
5. 画廊资产交接。

验收：

- 关闭应用后 Project 可恢复；
- Project 不因 Case 删除而丢失；
- 图层操作可撤销/重做（至少基础）。

## 5. P1 · 启动器加固

范围：

1. 队列落盘：queued/running 跨重启恢复或明确失败；
2. 设备维护页：禁用/重命名/显存预算；
3. 强制并发/显存配额（显式高级选项）；
4. 官方 Gradio 真机验收（27 GB 权重）；
5. 实例更新/回滚 UI；
6. 大文件下载中断/镜像切换压测；
7. Windows 实机验证。

验收：

- 重启后队列不静默丢任务；
- 真实权重启动 Gradio 成功；
- 队列/设备行为有测试或可重复脚本。

## 6. P2 · WebUI 与更新

范围：

1. Fastify + SSE/HTTP，复用服务层；
2. token/局域网开关/二维码；
3. 队列、画廊、日志的浏览器视图；
4. manifest 通道/ETag/签名；
5. 更新下载/校验/重启安装（macOS 先行）。

验收：

- 桌面与浏览器核心行为一致；
- 篡改 manifest/包被拒绝；
- 更新可暂停/续传，安装后版本正确。

## 7. P2 · 打包与 Beta

- macOS 签名、公证、dmg/zip；
- Windows NSIS、长路径、Defender 说明；
- 崩溃恢复、日志轮转、诊断包脱敏；
- 干净机器首次安装到出图验收；
- 设备矩阵：M1/M3/M4、16/32/64 GB。

## 8. V2 · 自研推理引擎（未排期）

复用 [future-inference-engine.md](future-inference-engine.md)：MNN 为主、
MPS 仅 oracle、MLX 条件触发。通过 `RuntimeAdapter` 接入，UI/协议不变。
在启动器积累真实设备日志、用户明确抱怨性能之前不启动。

## 9. 依赖关系

```
SSH 远端执行 ──> 远端真实 CUDA 验收 ──> 导出/采样执行
Clover 常驻后端 ──> Project/图层 ──> WebUI 复用
队列落盘/设备维护 ──> 打包/设备矩阵
Gradio 真机 + 27 GB 验收 ──> Beta
```

## 10. 明确不做

- V1 自研推理引擎；
- 训练内核/vendor KohakuMossTrainer；
- img2img/edit（官方未发布）；
- 移动端原生；
- 账号/云同步/模型市场后端；
- 遥测。

## 11. 与旧里程碑的关系

M0–M6 是早期按“推理启动器”排的里程碑，其中 M1–M4 已基本完成；
UI v0.2–v0.4 与 Trainer v0.4 是后续插入的交付批次。旧 M0–M6 不再作为
当前排期表，只保留为历史映射；当前顺序以本文 P0/P1/P2 为准。
