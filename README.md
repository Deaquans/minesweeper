# Minesweeper
A basic Minesweeper game built with plain HTML, CSS and JavaScript

Choose **Custom...** from the Game menu to set a width of 5-30 cells, a height
of 5-24 cells, and at least 5 mines. The maximum mine count is the number of
cells minus 9, leaving room for a safe first click and its neighbours.

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
