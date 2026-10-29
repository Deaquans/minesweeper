# Minesweeper

A compact, classic Minesweeper desktop app for Windows 11+ and Apple Silicon Macs built with
Electron, HTML, CSS and JavaScript.

## Download

Desktop downloads are published to [GitHub Releases](https://github.com/Deaquans/minesweeper/releases)
when a version tag is pushed:

- **Windows 11 or newer (x64):** download `Minesweeper.exe` and double-click to play. This is a
  portable application, not an installer: no setup wizard, shortcuts or admin
  rights are required. It extracts its runtime to a temporary folder on launch.
- **Apple Silicon Mac (including M4):** download `Minesweeper.dmg`.

The application is named **Minesweeper** on both platforms. Mac downloads are
native ARM64 builds; Intel Macs are not supported or packaged. Apple Silicon
builds also work on compatible M1, M2 and M3 Macs; they do not require Rosetta.
Windows 10 and older are not supported targets.

## Keybinds

**Right-click** or **Command-click** to flag tile.
**R** to restart game.
**H** to open help button.

## Files

- `desktop/main.cjs`: native window and packaging entry point
- `desktop/preload.cjs`: isolated, limited native window bridge
- `desktop/app.test.cjs`: desktop integration tests
- `index.html`, `style.css`, `game.js`: game UI, styling and logic
- `.github/workflows/release.yml`: cross-platform builds and release uploads
