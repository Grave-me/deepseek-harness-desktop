# Acceptance record — 0.1.0

Validated on Windows 11 x64 (build 26100) on 2026-08-16.

## Release identity

- Electron: `43.2.0`
- standalone Node.js sidecar: `24.18.0` (`win-x64`)
- `@deepseek-ai/dsh`: `0.1.0-rc.6`
- electron-builder: `26.15.3`
- installer: `release-candidate/DeepSeek-Harness-Desktop-0.1.0-x64-Setup.exe`
- installer SHA-256: `033371a8cff3e0ae57a9bc9adac98967d062e77980539b068212095723a75734`
- release admission: **FAIL — not approved for public release**

Passed checks include fixed-lock clean install, x64 packaging, standard-user installation, optional desktop shortcut, 0.0.9-to-0.1.0 upgrade, downgrade rejection, reinstall, uninstall, restricted-PATH packaged launch, fresh/existing isolated `.dsh`, all three port-3080 scenarios, 20 lifecycle cycles, crash recovery, SBOM/license generation, and metadata-only verification that the real `.dsh` remained unchanged.

Blocking gates are unsigned application artifacts, unresolved local API authentication and log-redaction findings, absence of a disposable clean Windows VM, pending shutdown/logoff and physical multi-display/tray interaction checks, and non-reproducible NSIS wrapper bytes.

See [`RELEASE_ACCEPTANCE_0.1.0.md`](RELEASE_ACCEPTANCE_0.1.0.md) for the complete evidence and command record.
