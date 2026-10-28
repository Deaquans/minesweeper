# Minesweeper

A basic Minesweeper game built with plain HTML, CSS and JavaScript (no build step or dependencies).

## Play

Open `index.html` in any browser (`open index.html` on macOS).

## Controls

- **Click**: reveal a cell (the first click is always safe)
- **Right-click / Ctrl-click / ⌘-click**: place or remove a flag
- **Flag mode** button or <kbd>F</kbd>: make a normal click place flags (handy on a trackpad)
- **Click a revealed number**: reveal its neighbours if the right number of flags is placed around it (chording)
- **🙂 button** or <kbd>R</kbd>: new game
- **❓ Help** button or <kbd>H</kbd>: show the controls

### Window buttons

- **×** closes the game window; double-click the desktop icon to reopen it
- **_** minimizes to the taskbar; click the taskbar button to restore
- **□** maximizes to fill the screen (double-clicking the title bar does the same)

Best times per difficulty are saved in `localStorage`.

## Files

- `index.html`: page structure
- `style.css`: styling
- `game.js`: game logic

## Turning it into a Mac app later

Because it's a self-contained static web app, it can be wrapped as-is with
[Tauri](https://tauri.app) (small native binary) or [Electron](https://www.electronjs.org)
by pointing the app window at `index.html`.

In the browser the title-bar buttons are simulated. In a desktop app, expose
`window.nativeWindow = { close, minimize, toggleMaximize }` (for example from an
Electron preload script) and the buttons will control the real window.
