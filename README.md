# DeepSeek Harness Desktop（Windows）

DeepSeek Harness Desktop 是官方 DeepSeek Harness Web UI 的 Windows 桌面宿主。应用使用 Electron 显示官方界面，并通过随包分发的独立 Node.js 运行时启动官方 `@deepseek-ai/dsh` CLI；本项目不复制、不分叉，也不重写 Harness UI。

> 本项目是非官方社区项目，与 DeepSeek AI 无隶属、赞助或背书关系。DeepSeek Harness 及相关名称归其权利人所有。
>
> **风险提示：**当前 `0.1.0` 是未签名的实验性候选版本，尚未通过公开生产发布验收。它仅适合个人、单用户、非敏感环境下的测试，不适用于共享电脑、远程桌面服务器、企业环境或处理敏感数据。下载和运行前请先阅读下方风险说明。

## 下载与安装

推荐从本仓库的私有 [Releases](../../releases) 页面下载安装器，而不是把大型二进制文件存入 Git 历史。

安装器名称：

```text
DeepSeek-Harness-Desktop-0.1.0-x64-Setup.exe
```

安装器是 Windows x64、NSIS 单用户安装器，不请求管理员权限。默认创建开始菜单和桌面快捷方式；如不需要桌面快捷方式，可通过命令行安装：

```powershell
DeepSeek-Harness-Desktop-0.1.0-x64-Setup.exe --no-desktop-shortcut
```

安装完成后可以删除下载的安装器和源码目录，已安装程序不依赖它们。请勿删除 `%USERPROFILE%\.dsh`，其中保存 Harness 的用户数据和配置。

## 实验性安装包的影响与风险

公开源代码不代表当前安装包已经达到生产发布标准。`0.1.0` 候选安装包尚未整改以下问题：

- **未进行代码签名：**Windows SmartScreen 可能显示“未知发布者”或阻止运行；企业杀毒、应用白名单和受管设备也可能直接拦截安装器或主程序。
- **本地用户隔离不足：**DSH 虽然只监听 `127.0.0.1`，但其 loopback API 当前没有 Windows 用户级认证边界。同一台共享电脑上的其他本地进程可能尝试访问端口 3080，因此不得用于共享、多用户或远程桌面服务器环境。
- **日志脱敏仍有缺口：**特定合成 JSON 形式的 Bearer 凭据可能无法被完整脱敏。不要公开上传完整日志、诊断包、`.dsh` 目录或 `.credentials.yaml`；提交问题前必须人工检查并删除敏感信息。
- **Windows 场景尚未全部验收：**真实干净虚拟机、关机/注销、托盘菜单完整交互和物理多显示器恢复仍待验证，特殊环境下可能出现启动、退出或窗口恢复问题。
- **上游仍处于预览阶段：**当前固定的 `@deepseek-ai/dsh 0.1.0-rc.6` 是 developer preview，后续可能发生不兼容变化。
- **没有自动更新：**发现安全问题或兼容问题后，应用不会自动升级，用户必须自行获取、核对并安装新版本。

当前候选版只建议用于个人单用户测试，并避免处理敏感数据。若你无法接受上述风险，请不要安装或运行。完整状态参见 [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) 和 [`RELEASE_ACCEPTANCE_0.1.0.md`](RELEASE_ACCEPTANCE_0.1.0.md)。

## 固定版本

| 组件 | 精确版本 |
|---|---:|
| Desktop | `0.1.0` |
| Electron | `43.2.0` |
| Node.js sidecar | `24.18.0`（Windows x64） |
| `@deepseek-ai/dsh` | `0.1.0-rc.6` |
| electron-builder | `26.15.3` |
| TypeScript | `6.0.3` |

所有直接依赖均使用精确版本，根项目与 sidecar 的依赖闭包分别由锁文件固定。构建脚本读取已安装的 `@deepseek-ai/dsh/package.json` 中的 `bin.dsh` 映射并生成运行时清单，应用代码不会猜测 DSH 的包内入口路径。

## 工作方式

- 应用使用单实例锁；第二实例不会再启动一个 DSH。
- DSH 只允许监听 `127.0.0.1:3080`。
- 如果启动前已有兼容 DSH 且只监听 `127.0.0.1`，桌面端会将其视为外部进程，退出时不会停止它。
- 如果 3080 被其他程序占用，或检测到非环回监听，应用会拒绝连接，不会终止未知进程。
- 关闭主窗口默认最小化到系统托盘。托盘菜单支持显示/隐藏窗口、浏览器打开、打开日志目录、重启自建 Harness 和退出。
- 卸载不会删除、迁移或修改 `%USERPROFILE%\.dsh`。

数据位置：

| 数据 | 位置 |
|---|---|
| Harness 用户数据 | `%USERPROFILE%\.dsh` |
| 桌面端配置 | `%APPDATA%\DeepSeek Harness Desktop\config.json` |
| 桌面端日志 | `%LOCALAPPDATA%\DeepSeek Harness Desktop\logs` |

日志按 10 MiB 轮转，最长保留 30 天且总量不超过 200 MiB。日志不会主动读取凭据文件内容，并会脱敏常见 API Key、Authorization、Cookie 和 Token 形式。提交故障报告时，请勿附加 `%USERPROFILE%\.dsh\.credentials.yaml`。

## 本地开发

开发环境使用 Node.js `24.18.0`：

```powershell
npm ci
npm run typecheck
npm test
npm run prepare:resources
npm run smoke:sidecar
npm run smoke:cycles
```

冒烟测试使用临时隔离的 Windows 用户目录和受限 `PATH`，不会读取或修改真实 `%USERPROFILE%\.dsh`。sidecar 仅通过固定可执行文件、参数数组和 `shell: false` 启动。

如果为了节省磁盘空间删除了 `build/runtime` 或 `sidecar/node_modules`，重新开发或打包前运行：

```powershell
npm run prepare:resources
```

## 构建安装器

```powershell
$env:SOURCE_DATE_EPOCH = "1786838400"
npm run dist:win
```

默认输出到 `artifacts`。设置 `DSH_BUILD_OUTPUT_DIR` 可以使用独立的候选输出目录：

```powershell
$env:DSH_BUILD_OUTPUT_DIR = "release-candidate"
npm run dist:win
```

安装器会阻止低版本覆盖已安装的高版本。构建结束后应复核 SHA-256、SBOM、许可证和 Authenticode 签名状态。

## 故障排查

- `PORT_CONFLICT`：端口 3080 被非 DSH 服务占用。请自行停止或重新配置占用程序；桌面端不会结束它。
- `EXTERNAL_NON_LOOPBACK` / `NON_LOOPBACK_LISTENER`：检测到并非只监听 `127.0.0.1` 的服务，应用拒绝连接。
- `START_TIMEOUT`：DSH 在 30 秒内没有就绪。请打开日志目录检查原因，然后重试。
- `UNEXPECTED_EXIT`：桌面端启动的 DSH 意外退出。请检查日志，再使用“重试/重启”。
- 保存窗口所在的显示器被移除后，应用会忽略不可见坐标，并在可用显示器上打开。

## 安全设计

- `contextIsolation`、渲染器沙箱和 `webSecurity` 均开启。
- `nodeIntegration` 关闭。
- Harness 页面不会获得桌面 IPC bridge。
- 本地状态页只暴露固定的状态查询、重试、打开日志和退出操作。
- 下载、权限请求、新窗口、非环回导航和非环回渲染器网络请求均被阻止。
- HTTPS 外部链接需要用户确认，并交给系统浏览器打开。

当前候选版本仍存在未完成的安全与发布门槛，包括应用未签名、本地 DSH API 的用户隔离认证边界和部分日志脱敏缺口。详情参见 [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) 和 [`RELEASE_ACCEPTANCE_0.1.0.md`](RELEASE_ACCEPTANCE_0.1.0.md)。

## 许可证与供应链材料

- [`LICENSE`](LICENSE)
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- [`VERSIONS.json`](VERSIONS.json)
- [`SBOM.spdx.json`](SBOM.spdx.json)
- [`ACCEPTANCE.md`](ACCEPTANCE.md)

Node.js、Electron、DeepSeek Harness 以及第三方 npm 包的许可证文本会随相应运行时或包一起保留。

## 最后一点碎碎念

这个项目全程使用GPT5.6 sol模型完成，模型推理强度中。花了我plus套餐近70的额度，也算是大出血了，目前简单测试没有什么问题，具体测试情况还是靠各位网友了。我暂时没有继续测试的打算。

