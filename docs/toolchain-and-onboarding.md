# 工具链与首次运行准备

- 状态：设计已确认（2026-10-19），未实现
- 决策：[ADR-0006](decisions/0006-system-toolchain.md)
- 目标：用户机器上没有 Git/Python、或 PATH 不可用时，启动器仍能完成检测、
  官方安装引导、重新扫描和绝对路径接管

> 本文把“可用性检查”理解为首次启动时对 Git/Python/uv/实例/运行时/模型的依赖
> 检查，不是网络可达性单项检查。网络失败只作为“打开安装页/下载失败”的子错误处理。

## 1. 现在的问题

| 位置 | 现状 | 问题 |
| --- | --- | --- |
| `env.ts` | 扫描 PATH 里的 git/python、`runtimes/python` | 只是报告；`pickPython` 不使用 managed |
| `runtimes.ts` | `pickPython` 只查 settings + PATH | 没有 Python 时只在创建运行时失败 |
| `git.ts` | 所有命令直接执行 `git` | 没有 Git 时抛裸错误 |
| `onboarding.ts` | 实例/运行时/模型三行 | 不检查 Git/Python |
| `Oobe.tsx` | 三行清单，动作只去实例/模型/设置 | 没有工具链准备入口 |
| `diagnostics.ts` | 主要匹配日志规则 | 没有缺 Git/Python 的预检卡片 |
| `settings.ts` | 只有 `pythonPath` | 没有 Git 路径、工具来源、重新扫描 |

## 2. 产品选择

- **不捆绑、不下载受管 Git/Python**，避免安装包膨胀、GPL/第三方 notices 和
  “应用内又一套 Python”的支持成本；
- 优先使用系统 Git/Python；启动器负责**扫描、解释、引导安装、绝对路径接管**；
- 安装只打开官方安装器/页面，不静默执行、不提权、不修改系统 PATH；
- OOBE 软引导：允许本次跳过，但创建实例/安装运行时/启动前有预检拦截；
- 工具版本固定在应用内：Git 最低 2.30，Python 最低 3.10，推荐 3.12。

## 3. 用户流程

### 3.1 首次启动

```
启动
 → 环境扫描（系统/工具链/网络/GPU）
 → OOBE 可用性清单
    ├─ 运行环境：Git ✓ / Python ✗  [准备]
    ├─ 实例：未安装             [去实例]
    ├─ 运行时：等待实例         [去实例]
    └─ 模型：未下载 27 GB       [去模型]
```

点“准备”打开工具链安装引导：

```
运行环境
  Git      系统 · /usr/bin/git · 2.45.0       [重新扫描] [选择路径]
  Python   未找到 3.10+                        [安装 Python] [选择路径]
  uv       可选 · 未安装                       [打开安装页]

提示：安装完成后回到这里点“重新检查”，不需要重启启动器。
```

- macOS Git 缺失：执行 `xcode-select --install`；
- macOS Python：打开 python.org macOS 下载页，安装后扫描
  `/Library/Frameworks/Python.framework/...`、Homebrew、pyenv 等位置；
- Windows Git/Python：打开官方下载页，提供可复制的 winget 命令；
- 安装完成后重新扫描；允许“本次跳过”；
- OOBE 不自动下载 27 GB 模型。

### 3.2 设置

新增“工具链”分组：

- Git：来源（PATH/常见目录/自定义）、版本、路径、重新扫描、选择可执行文件；
- Python：来源、版本、路径、重新扫描、选择解释器；
- uv：可选；存在则用于 venv/安装，缺失时走 `python -m venv` + pip；
- “打开官方安装页”“重新检查”；
- 覆盖只在启动器内部生效，不修改系统 PATH。

### 3.3 诊断

当用户绕过 OOBE 直接操作时，预检生成诊断卡片：

- 缺 Git：“创建实例需要 Git。启动器可以打开 Git 安装页；装完点重新检查。”
  - [安装 Git] [打开工具链] [重新扫描]
- 缺 Python：“运行时需要 Python 3.10+。可以打开 python.org 安装页。”
  - [安装 Python] [选择解释器] [重新扫描]
- Windows Store 占位符：“`python` 指向商店占位符，不能执行。”
  - [选择 Python] [安装 Python] [重新扫描]
- 版本过低：“检测到 Python 3.9，最低要求 3.10。”
  - [安装 Python] [选择解释器]

诊断卡片和 OOBE 使用同一份 `ToolchainStatus`，不各自缓存“看起来装好了”。

## 4. 技术方案

### 4.1 扫描

新增 `main/services/toolchain.ts`：

```
getToolchainStatus(): ToolchainStatus
scanTools(): ToolchainStatus
validateGit(path): ToolInfo
validatePython(path): ToolInfo
resolveGit(): { command: string; env: NodeJS.ProcessEnv }
resolvePython(): { command: string; version: string; source: ToolSource }
openInstallGuide(tool: 'git' | 'python'): Promise<void>
```

扫描顺序：显式设置路径 → PATH → 常见目录。所有候选执行 `--version` 自检；
记录 source/version/path/ready/minVersion；不持久化“已安装”状态，每次重新解析。

平台扫描路径：

- macOS Git：`/usr/bin/git`、`/opt/homebrew/bin/git`、`/usr/local/bin/git`；
- macOS Python：Homebrew、`/usr/local/bin`、python.org Framework、pyenv、`~/.local/bin`；
- Windows Git：`where git`、`%ProgramFiles%\Git\cmd\git.exe`、
  `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`；
- Windows Python：`py -3`、`where python`、`%LOCALAPPDATA%\Programs\Python\...`、
  `C:\Python3xx\python.exe`；排除 Microsoft Store alias；
- Linux：PATH + `/usr/bin`、`/usr/local/bin`。

### 4.2 接管

- `git.ts`：所有命令走 `resolveGit()` 的绝对路径；子进程 env 把 Git 目录前置到
  PATH，必要时设置 `GIT_EXEC_PATH`；
- `runtimes.ts`：`pickPython` 先看显式路径，再走 `resolvePython()`；venv 创建、
  依赖安装、runner/Gradio 启动使用同一个解析结果；
- `supervisor.ts`：任务 env 注入解析后的 Python/Git 路径；
- 不写系统 PATH，不写全局环境变量；
- 启动器日志/诊断显示“实际使用路径”。

### 4.3 安装引导

| 平台 | Git | Python |
| --- | --- | --- |
| macOS | `xcode-select --install` | `https://www.python.org/downloads/macos/` |
| Windows | `https://git-scm.com/download/win` | `https://www.python.org/downloads/windows/` |
| Linux | 发行版文档/包管理器命令 | 发行版文档/包管理器命令 |

- 打开安装器/页面后，面板保持“安装完成后重新检查”；
- 不自动下载 exe/dmg，不执行安装器；
- Windows 显示可复制命令：`winget install Git.Git`、
  `winget install Python.Python.3.12`，但不自动运行；
- 重新检查后更新 OOBE/诊断；失败给出路径/权限/版本原因。

### 4.4 状态

`ToolchainStatus` 不落盘为 ready；只在内存/事件中传递。设置里保存用户显式路径，
不保存扫描推导出的“ready”。这样系统升级/卸载后不会误报。

## 5. 错误码

| 错误码 | 触发 | 解决动作 |
| --- | --- | --- |
| `E_GIT_MISSING` | 实例/启动预检找不到 Git | 打开 Git 安装页 / 选择路径 / 重扫 |
| `E_GIT_OLD` | Git < 2.30 | 打开工具链 / 安装页 |
| `E_PYTHON_MISSING` | 找不到 3.10+ | 打开 Python 安装页 / 选择解释器 / 重扫 |
| `E_PYTHON_STORE` | Windows Store 占位符/不可执行 | 选择解释器 / 安装 Python |
| `E_TOOL_PATH` | 自定义路径不可执行 | 打开工具链 / 重扫 |
| `E_TOOL_PERMISSION` | 无执行权限/安全软件拦截 | 打开日志 / 重扫 |

预检错误进入现有诊断列表；日志里出现 `command not found` 时仍由
`release/rules.json` 兜底。

## 6. 验收

- 干净 macOS（无 CLT/Git、无 Python）首次启动：OOBE 出现运行环境缺失；
- 点击 Git 引导会打开 `xcode-select --install`；装完后重新检查能识别；
- 用户安装了 Python 但不在 PATH：能从常见目录发现，或手动选择；
- PATH 为空/被污染时，设置显式路径后仍能创建实例/安装运行时；
- 诊断动作能打开安装页并重新扫描；
- 不修改系统 PATH、不要求管理员权限；
- Windows 仅代码路径/未实机时，状态文档标 🟡/⬜；
- 没有 Git/Python 时，错误必须是可解释的预检卡片，不是裸 traceback。

## 7. 待确认

已确认的 6 项见 [ADR-0006 §6](decisions/0006-system-toolchain.md#6-已确认)。
实现前只剩安装页 URL/文案和 macOS Python 推荐版本（3.12）需要最终核对。
