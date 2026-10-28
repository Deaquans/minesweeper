# Minesweeper
A basic Minesweeper game built with plain HTML, CSS and JavaScript

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
