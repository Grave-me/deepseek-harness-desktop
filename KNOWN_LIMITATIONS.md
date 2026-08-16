# Known limitations and incomplete release checks

- The 0.1.0 candidate installer and application executable are unsigned. Windows SmartScreen may warn; public release requires an organization-owned code-signing certificate and signature verification.
- Installation, 0.0.9-to-0.1.0 upgrade, downgrade rejection, reinstall, packaged launch, and uninstall passed under a non-elevated standard-user token on the current Windows host. The uninstall check compared only `.dsh` file-system metadata (path, type, size, and timestamp), did not read file contents, and found it unchanged. A disposable clean-VM run, Windows shutdown/logoff, interactive tray-menu, and physical multi-display testing remain release gates.
- A repeated build produced identical `app.asar` and application EXE files, but a different NSIS installer hash. The installer is not bit-for-bit reproducible.
- The bundled DSH loopback API has no per-user authentication boundary, and a synthetic JSON Bearer value can partially bypass the current log redactor. Both are release blockers pending product/security remediation.
- DSH `0.1.0-rc.6` is a developer preview. Only that exact version is supported by this build.
- Port 3080 is intentionally fixed because the embedded navigation and service identity policy are scoped to the documented DSH default. The app does not expose a port setting in v0.1.0.
- External compatible DSH processes cannot be restarted from the desktop app because ownership cannot be proven; this is deliberate.
- Automatic application updates and telemetry are not included.
