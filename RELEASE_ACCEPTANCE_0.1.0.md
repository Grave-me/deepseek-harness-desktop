# DeepSeek Harness Desktop 0.1.0 发布验收报告

验收日期：2026-08-16  
平台：Windows 11 10.0.26100，x64，当前进程为 Medium Integrity 标准用户  
结论：**FAIL（不可公开发布）**

## 候选产物

| 项目 | 值 |
|---|---|
| 安装器 | `release-candidate/DeepSeek-Harness-Desktop-0.1.0-x64-Setup.exe` |
| SHA-256 | `033371a8cff3e0ae57a9bc9adac98967d062e77980539b068212095723a75734` |
| unpacked | `release-candidate/win-unpacked` |
| 安装器架构 | NSIS x86 bootstrap，负载与应用为 Windows x64 |
| 安装模式 | assisted、per-user、`allowElevation=false` |
| 安装器签名 | `NotSigned` |
| 主应用签名 | `NotSigned` |
| 内置 Node 签名 | `Valid`，OpenJS Foundation |

精确版本：Desktop `0.1.0`、Electron `43.2.0`、Node `24.18.0`、`@deepseek-ai/dsh` `0.1.0-rc.6`、electron-builder `26.15.3`、TypeScript `6.0.3`。

## 验收结果

| # | 验收项 | 结果 | 证据摘要 |
|---:|---|---|---|
| 1 | 锁文件干净安装与可复现构建 | **部分通过** | 固定 Node 24.18.0 执行根 `npm ci`；主锁 285、sidecar 锁 587 个节点均有 `resolved/integrity`；两次构建的 `app.asar` 与主 EXE 相同，但 NSIS SHA-256 不同。 |
| 2 | x64 NSIS 与 unpacked | **通过** | electron-builder 明确输出 `platform=win32 arch=x64`；两类产物均存在。 |
| 3 | 标准用户、开始菜单、可选桌面快捷方式 | **通过** | Medium Integrity 下安装退出 0；开始菜单存在；`--no-desktop-shortcut` 时桌面快捷方式不存在，默认安装时存在；卸载后均删除。 |
| 4 | 无全局 Node/npm/pnpm 启动 | **部分通过** | 已安装版在子进程 `PATH` 仅含 `System32` 时启动、单实例与退出通过；本机无 Windows Sandbox，未在独立干净用户/VM 中复核。 |
| 5 | 已有和全新 `.dsh` | **通过** | 两种隔离用户目录均启动；已有目录的非敏感哨兵文件保持不变。未读取任何凭据内容。 |
| 6 | 安装、升级、降级阻止、卸载、重装 | **通过** | 0.0.9 首装→0.1.0 覆盖升级成功；0.0.9 降级退出码 2 且文件保持 0.1.0；卸载与重装成功。 |
| 7 | `.dsh` 与应用缓存 | **部分通过** | 最终安装/卸载前后真实 `.dsh` 的 550 个条目元数据摘要一致；`deleteAppDataOnUninstall=false` 静态确认应用数据按设计保留，未对真实应用缓存做破坏性动态测试。 |
| 8 | 3080 三场景 | **通过** | 空闲时自建；预存 DSH 时连接且退出不停止；非 DSH 占用时拒绝且不替换/终止原监听。最终监听数为 0。 |
| 9 | 托盘、注销/关机、崩溃、多显示器 | **部分通过** | 打包启动证明托盘可构造；受控强杀未留下 DSH，重启后干净恢复；托盘菜单交互、真实注销/关机和物理多显示器恢复未执行。 |
| 10 | 哈希、版本、SBOM、许可证、报告 | **通过** | SHA 文件复算一致；`VERSIONS.json`、585 包 SPDX 2.3 SBOM、`THIRD_PARTY_NOTICES.md` 与 Node/DSH 许可证均存在。 |
| 11 | 代码签名 | **失败** | 安装器和主应用均为 `NotSigned`，不可公开发布。 |

补充回归：TypeScript 检查通过；11/11 单元测试通过；根与 sidecar `npm audit --omit=dev` 均为 0；20/20 连续启动/退出无监听残留；第二实例未启动第二个 DSH；崩溃探测结果为 `orphanRemained=false, cleanRestart=true`。

## 本次仅打包/验收层修复

- 补齐 sidecar 锁中 528 个缺失的 `resolved/integrity`，全部安装路径与版本保持不变。
- 嵌套 sidecar `npm ci` 改为由当前固定 Node 进程执行，避免误用系统 Node。
- 构建输出可通过 `DSH_BUILD_OUTPUT_DIR` 隔离，绕开被外部进程占用的旧产物目录。
- 增加 NSIS 降级阻止；实测更低版本退出码为 2。
- SPDX SBOM 增加 Desktop、Electron、Node 三个顶层组件，并支持 `SOURCE_DATE_EPOCH` 固定生成时间。
- 增加端口冲突、外部 DSH、崩溃恢复、已有/全新 `.dsh` 和受限 PATH 验收脚本。

## 阻止发布的问题

1. **未签名**：最终安装器与主应用均 `NotSigned`。必须配置组织代码签名证书，对安装器、主 EXE 和适用负载签名并验证时间戳链。
2. **本地安全边界不足**：已知安全审查确认 DSH loopback API 缺少按 Windows 用户隔离的认证边界；共享/多用户主机上不可公开发布。
3. **日志脱敏缺口**：合成 JSON `Authorization: Bearer …` 形态可留下部分值；在修复并补充回归测试前不可发布。
4. **缺少真实干净环境验收**：当前主机无 Windows Sandbox；仅以隔离 profile 和仅 `System32` PATH 模拟。必须在无全局 Node/npm/pnpm 的一次性标准用户 VM 中复跑最终安装器。
5. **OS/UI 场景未完成**：真实注销/关机、托盘菜单全交互和物理多显示器窗口恢复仍待手工/自动化验收。
6. **安装器非 bit-for-bit 可复现**：相同 payload 的二次 NSIS 构建哈希不同；如发布政策要求二进制可复现，需继续解决 NSIS 时间戳/封装非确定性。

## 关键验收命令

```powershell
# 固定 Node 24.18.0 驱动 npm 11.16.0
build\toolchain\node.exe "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" ci
npm run typecheck
npm test

$env:SOURCE_DATE_EPOCH = "1786838400"
$env:DSH_BUILD_OUTPUT_DIR = "release-candidate"
npm run dist:win

npm run smoke:sidecar
npm run smoke:external
npm run smoke:cycles

Get-FileHash release-candidate\DeepSeek-Harness-Desktop-0.1.0-x64-Setup.exe -Algorithm SHA256
Get-AuthenticodeSignature release-candidate\DeepSeek-Harness-Desktop-0.1.0-x64-Setup.exe
```

安装、升级、降级、卸载测试均使用可执行文件加参数数组或 PowerShell `Start-Process -ArgumentList` 驱动测试工具；应用产品代码仍以 `spawn(..., { shell: false })` 启动 sidecar。报告未记录或输出任何真实密钥、Token 或凭据文件内容。
