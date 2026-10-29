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

## Playing

Click to reveal a tile; right-click or Command-click to flag it.
The desktop board measures the rendered controls and shrinks its tiles when needed
to fit the display's available work area.
Use **R** to restart and **H** for Help.
Theme switches between classic and dark palettes. Settings lets you choose red
(default), blue, green, yellow or purple for the timer and mine counter.
Your theme and counter color are saved automatically and restored when you reopen
the app. The message box displays your time after completing a board.

## Files

- `desktop/main.cjs`: native window and packaging entry point
- `desktop/preload.cjs`: isolated, limited native window bridge
- `desktop/app.test.cjs`: desktop integration tests
- `index.html`, `style.css`, `game.js`: game UI, styling and logic
- `.github/workflows/release.yml`: cross-platform builds and release uploads
