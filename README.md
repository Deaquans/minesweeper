# Minesweeper

A compact, classic Minesweeper desktop app for Windows and macOS, built with
Electron, HTML, CSS and JavaScript.

## Download

Desktop downloads are published to [GitHub Releases](https://github.com/Deaquans/minesweeper/releases)
when a version tag is pushed:

- **Windows:** download `Minesweeper.exe` and double-click to play. This is a
  portable application, not an installer: no setup wizard, shortcuts or admin
  rights are required. It extracts its runtime to a temporary folder on launch.
- **Apple Silicon Mac:** download `Minesweeper-arm64.dmg`.
- **Intel Mac:** download `Minesweeper-x64.dmg`.

The application is named **Minesweeper** on both platforms. Mac
downloads include the architecture only to distinguish the two builds.

On macOS, open the disk image and drag Minesweeper into Applications.
These builds are unsigned; Windows SmartScreen or macOS Gatekeeper may warn
or block installation. Signed/notarized distribution requires platform signing
certificates and, for macOS, an Apple Developer account; it is not configured here.

The desktop app has sharp, square window corners, no native window shadow, no browser chrome, and no
surrounding desktop background.
Drag its title bar to move it. Minimize uses the operating system's taskbar or
Dock, maximize/fullscreen is disabled, and Close exits the app on both platforms.
The window automatically fits the selected board.

## Playing

Click to reveal a tile; right-click or Command-click to flag it.
Choose **Custom...** from Game for widths of 5-30, heights of 5-24, and at least
5 mines. The maximum mine count is the number of cells minus 9 to protect the
first click and its neighbours. Use **R** to restart and **H** for Help.
Theme switches between classic and dark palettes. The message box displays
your time after completing a board.

## Development

Install Node.js 24 LTS, then:

```sh
npm ci
npm start
```

```sh
npm test
npm run pack
npm run dist
```

Tests launch the actual Electron app and exercise native sizing, window controls,
gameplay and custom boards. `pack` builds an unpacked application; `dist` builds
downloads for the current platform. Build macOS downloads on macOS and the Windows
portable executable on Windows.

Opening `index.html` in a browser still runs the game with simulated window
controls, but the downloadable desktop app uses real native controls.

## Publishing releases

Commit and push the source and lockfile, then create a tag matching the version
in `package.json`, for example:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The desktop release workflow tests and builds Windows x64, macOS Apple Silicon,
and macOS Intel downloads. Only when all builds succeed does it publish their
downloads to the tag's GitHub Release. Running the workflow manually produces
downloadable Actions artifacts without publishing a release. To rebuild and publish
an existing version, enter its tag in the manual workflow's `release_tag` field.
Both Mac architectures are packaged on an Intel Mac runner; native integration
tests run on Windows and Intel macOS.

## Files

- `desktop/main.cjs`: native window and packaging entry point
- `desktop/preload.cjs`: isolated, limited native window bridge
- `desktop/app.test.cjs`: desktop integration tests
- `index.html`, `style.css`, `game.js`: game UI, styling and logic
- `.github/workflows/release.yml`: cross-platform builds and release uploads
