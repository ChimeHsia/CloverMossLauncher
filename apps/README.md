# apps/（M3 起）

## 形态

| 目录 | 技术 | 说明 |
| --- | --- | --- |
| `desktop/` | Tauri 2（Rust）+ React | 桌面启动器；链接引擎 C ABI，管理进程/文件/更新 |
| `web/` | React + TypeScript | 与桌面共用同一份前端；由本地引擎托管，或连接远端 headless |
| `mobile/` | Swift / Kotlin 壳 | 复用同一 C++ 核心，M5 |

## 前端约定

- 状态：Zustand（轻量，无服务端渲染需求）；
- 数据：`/v1` REST + SSE，类型由 `contracts/*.schema.json` 生成；
- 不直接调用引擎 C ABI（除桌面端的文件对话框、托盘等系统能力）；
- 所有生图参数可序列化为"可复现链接"（模型+seed+prompt+adapter）。

## 页面

1. **模型库**：下载、校验、量化档、磁盘占用、按内存推荐；
2. **生成**：prompt、负面词、尺寸、profile（50/20/8 步）、CFG、seed、批量、布局编辑器；
3. **队列**：单 GPU 串行、拖拽排序、取消、ETA；
4. **画廊**：PNG + 内嵌元数据、同参数重跑、对比视图；
5. **适配器**：LoRA/LyCORIS 列表、strength、触发词；
6. **设置**：模型目录、后端、内存档、语言、遥测（默认关）；
7. **训练（可选）**：外部环境检测、配置、启动、loss/样例。

## 打包

- macOS：universal2 壳 + 按架构分发的引擎 dylib/Metal 库， hardening + 公证；
- Windows：MSI/NSIS，Vulkan 运行时随包；
- 模型不入安装包，首次运行下载（可断点续传、可离线导入）。
