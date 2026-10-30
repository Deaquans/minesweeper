const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { _electron: electron } = require("playwright");

test("theme and counter color survive quitting and reopening", { timeout: 60000 }, async (t) => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "minesweeper-settings-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.MINESWEEPER_EXECUTABLE;
  let app;
  t.after(async () => {
    if (app) await app.close();
    await rm(userData, { recursive: true, force: true });
  });
  async function launch() {
    app = await electron.launch({
      executablePath,
      args: [...(executablePath ? [] : [path.join(__dirname, "..")]), `--user-data-dir=${userData}`],
      env
    });
    const page = await app.firstWindow();
    await page.waitForSelector(".cell");
    return page;
  }
  async function quit(page) {
    const exited = new Promise((resolve) => app.process().once("exit", resolve));
    await page.locator("#btn-close").evaluate((button) => setTimeout(() => button.click(), 0));
    assert.equal(await exited, 0);
    app = null;
  }

  let page = await launch();
  await page.locator("#btn-settings").click();
  await page.locator("#settings-counter-color").selectOption("blue");
  await page.locator("#settings-ok").click();
  await quit(page);

  page = await launch();
  assert.equal(await page.locator("body").getAttribute("data-theme"), "light");
  assert.equal(await page.locator("#settings-counter-color").inputValue(), "blue");
  await page.locator("#btn-theme").click();
  await page.locator("#btn-settings").click();
  await page.locator("#settings-counter-color").selectOption("purple");
  await page.locator("#settings-ok").click();
  await quit(page);

  page = await launch();
  assert.equal(await page.locator("body").getAttribute("data-theme"), "dark");
  assert.equal(await page.locator("#btn-theme").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#settings-counter-color").inputValue(), "purple");
  for (const id of ["timer", "mine-counter"]) {
    assert.equal(await page.locator(`#${id} .seg.on`).first().evaluate((el) =>
      getComputedStyle(el).backgroundColor), "rgb(192, 96, 255)");
  }
});

test("Expert fits a small work area with taller platform controls", { timeout: 60000 }, async (t) => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "minesweeper-sizing-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.MINESWEEPER_EXECUTABLE;
  let app;
  t.after(async () => {
    if (app) await app.close();
    await rm(userData, { recursive: true, force: true });
  });
  app = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : [path.join(__dirname, "..")]), `--user-data-dir=${userData}`],
    env
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".cell");
  await app.evaluate(({ screen }) => {
    const getDisplayMatching = screen.getDisplayMatching.bind(screen);
    screen.getDisplayMatching = (bounds) => ({
      ...getDisplayMatching(bounds),
      workAreaSize: { width: 1024, height: 684 },
    });
  });
  await Promise.all([
    page.waitForEvent("load"),
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.reload()),
  ]);
  await page.waitForSelector(".cell");
  await page.addStyleTag({ content: ".status-line { padding-bottom: 80px; }" });
  for (const [mode, count] of [["expert", 480], ["beginner", 81], ["expert", 480]]) {
    await page.locator("#difficulty").selectOption(mode);
    await page.waitForFunction(() => {
      const bounds = document.querySelector("#window").getBoundingClientRect();
      return Math.ceil(bounds.width) === innerWidth && Math.ceil(bounds.height) === innerHeight;
    });
    assert.equal(await page.locator(".cell").count(), count);
    const bounds = await page.locator("#window").boundingBox();
    assert.ok(bounds.width <= 1024);
    assert.ok(bounds.height <= 684);
    assert.equal(await page.locator(".cell").first().evaluate((el) =>
      getComputedStyle(el).width === getComputedStyle(el).height), true);
  }
});

test("desktop window fits the game and native controls work", { timeout: 60000 }, async (t) => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.MINESWEEPER_EXECUTABLE;
  const app = await electron.launch({
    executablePath,
    args: executablePath ? [] : [path.join(__dirname, "..")],
    env
  });
  t.after(() => app.close());
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".cell");

  async function assertFits() {
    try {
      await page.waitForFunction(() => {
        const bounds = document.querySelector("#window").getBoundingClientRect();
        return Math.ceil(bounds.width) === innerWidth && Math.ceil(bounds.height) === innerHeight;
      });
    } catch (error) {
      t.diagnostic(JSON.stringify({
        renderer: await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          bounds: document.querySelector("#window").getBoundingClientRect().toJSON(),
          difficulty: document.querySelector("#difficulty").value,
        })),
        native: await app.evaluate(({ BrowserWindow, screen }) => {
          const window = BrowserWindow.getAllWindows()[0];
          return {
            bounds: window.getBounds(),
            content: window.getContentSize(),
            workArea: screen.getDisplayMatching(window.getBounds()).workArea,
          };
        }),
      }));
      throw error;
    }
    const bounds = await page.locator("#window").boundingBox();
    assert.equal(bounds.x, 0);
    assert.equal(bounds.y, 0);
  }

  await assertFits();
  assert.equal(await page.locator("#btn-maximize").isDisabled(), true);
  const settings = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      resizable: window.isResizable(),
      maximizable: window.isMaximizable(),
      fullscreenable: window.isFullScreenable(),
      shadow: window.hasShadow()
    };
  });
  assert.deepEqual(settings, { resizable: false, maximizable: false, fullscreenable: false, shadow: false });

  if (process.platform === "win32") {
    const handle = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
    const preference = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
      Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices;
      public static class WindowCorners {
        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
      }';
      $preference = 0;
      $result = [WindowCorners]::DwmGetWindowAttribute([IntPtr]::new(${handle}), 33, [ref]$preference, 4);
      if ($result -ne 0) { throw "Cannot query native corner preference: $result" };
      Write-Output $preference;
    `], { encoding: "utf8" });
    assert.equal(preference.trim(), "1", "Windows must disable native rounded corners");
  }

  await page.locator("#window > .title-bar .title").dblclick();
  assert.equal(await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isMaximized()), false);

  await page.locator("#difficulty").selectOption("expert");
  assert.equal(await page.locator(".cell").count(), 480);
  await assertFits();
  assert.deepEqual(await page.locator("#difficulty option").evaluateAll((options) =>
    options.map((option) => option.value)), ["beginner", "intermediate", "expert"]);
  await page.locator("#difficulty").selectOption("intermediate");
  assert.equal(await page.locator(".cell").count(), 256);
  await assertFits();
  await page.locator("#difficulty").selectOption("beginner");
  assert.equal(await page.locator(".cell").count(), 81);
  await assertFits();

  const first = page.locator(".cell").first();
  await first.click({ button: "right" });
  assert.equal(await first.textContent(), "🚩");
  await first.click({ button: "right" });
  await first.click();
  assert.equal(await first.evaluate((el) => el.classList.contains("revealed")), true);
  await page.locator("#btn-theme").click();
  assert.equal(await page.locator("body").getAttribute("data-theme"), "dark");
  assert.match(await page.locator("#btn-theme").evaluate((el) =>
    getComputedStyle(el).boxShadow), /-1px -1px/);
  await page.locator("#btn-theme").click();
  assert.equal(await page.locator("body").getAttribute("data-theme"), "light");
  await assertFits();
  await page.keyboard.press("h");
  assert.equal(await page.locator("#help-overlay").isVisible(), true);
  await page.locator("#help-ok").click();

  await page.locator("#reset").click();
  await page.evaluate(() => {
    const random = Math.random;
    try {
      Math.random = () => 0;
      document.querySelector(".cell").click();
    } finally {
      Math.random = random;
    }
    const mines = new Set([2, 3, 4, 5, 6, 7, 8, 11, 12, 13]);
    document.querySelectorAll(".cell").forEach((cell, index) => {
      if (!mines.has(index)) cell.click();
    });
  });
  assert.equal(await page.locator("#reset").textContent(), "😎");
  assert.match(await page.locator("#message").textContent(), /^Time: \d+s$/);
  assert.equal(await page.locator("#mine-counter").getAttribute("aria-label"), "Mines remaining: 000");
  await page.locator("#reset").click();
  assert.equal(await page.locator(".cell").count(), 81);
  assert.equal(await page.locator("#message").textContent(), "");

  await page.locator("#btn-minimize").click();
  await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window.isMinimized()) {
      await new Promise((resolve) => window.once("minimize", resolve));
    }
  });
  assert.equal(await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isMinimized()), true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await page.waitForFunction(() => document.visibilityState === "visible");
  assert.deepEqual(errors, []);

  const exited = new Promise((resolve) => app.process().once("exit", resolve));
  // Return control to Playwright before the close handler terminates its connection.
  await page.locator("#btn-close").evaluate((button) => {
    setTimeout(() => button.click(), 0);
  });
  assert.equal(await exited, 0);
});

test("all difficulties pause with P, on focus loss and on minimizing", { timeout: 60000 }, async (t) => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "minesweeper-pause-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.MINESWEEPER_EXECUTABLE;
  const app = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : [path.join(__dirname, "..")]), `--user-data-dir=${userData}`],
    env
  });
  t.after(async () => {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".cell");

  assert.equal(await page.locator("#btn-pause").count(), 0);
  for (const mode of ["beginner", "intermediate", "expert"]) {
    await page.locator("#difficulty").selectOption(mode);
    await page.locator("#reset").click();
    await page.keyboard.press("p");
    assert.equal(await page.locator("#pause-overlay").isVisible(), false);
    await page.locator(".cell").first().click();
    assert.equal(await page.locator("#pause-overlay").isVisible(), false, `${mode}: starting game`);
    await page.waitForFunction(() =>
      document.querySelector("#timer").getAttribute("aria-label") !== "Time: 000");

    await page.keyboard.press("p");
    assert.equal(await page.locator("#pause-overlay").isVisible(), true);
    const pausedTime = await page.locator("#timer").getAttribute("aria-label");
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("#timer").getAttribute("aria-label"), pausedTime);
    const revealedWhilePaused = await page.locator(".cell.revealed").count();
    await page.locator(".cell:not(.revealed)").first().evaluate((cell) => cell.click());
    assert.equal(await page.locator(".cell.revealed").count(), revealedWhilePaused);

    await page.keyboard.press("p");
    assert.equal(await page.locator("#pause-overlay").isVisible(), false);
    const resumedTime = await page.locator("#timer").getAttribute("aria-label");
    await page.waitForFunction((previous) =>
      document.querySelector("#timer").getAttribute("aria-label") !== previous,
    resumedTime, { timeout: 3000 });

    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    assert.equal(await page.locator("#pause-overlay").isVisible(), true);
    await page.locator("#pause-resume").click();
    assert.equal(await page.locator("#pause-overlay").isVisible(), false);
  }

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await page.waitForFunction(() => !document.querySelector("#pause-overlay").hidden);
  assert.equal(await page.locator("#pause-overlay").getAttribute("hidden"), null);
  const minimizedTime = await page.locator("#timer").getAttribute("aria-label");
  await page.waitForTimeout(1200);
  assert.equal(await page.locator("#timer").getAttribute("aria-label"), minimizedTime);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.restore();
    window.focus();
  });
  await page.waitForFunction(() => !document.hidden);
  assert.equal(await page.locator("#pause-overlay").isVisible(), true);
  await page.locator("#pause-resume").click();
  assert.equal(await page.locator("#pause-overlay").isVisible(), false);
});

test("Help and Settings suspend the timer without clearing existing pauses", { timeout: 60000 }, async (t) => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "minesweeper-menu-timer-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.MINESWEEPER_EXECUTABLE;
  const app = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : [path.join(__dirname, "..")]), `--user-data-dir=${userData}`],
    env
  });
  t.after(async () => {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".cell");
  for (const mode of ["beginner", "intermediate", "expert"]) {
    await page.locator("#difficulty").selectOption(mode);
    await page.locator(".cell").first().click();
    for (const menu of ["help", "settings"]) {
      await page.locator(`#btn-${menu}`).click();
      const menuTime = await page.locator("#timer").getAttribute("aria-label");
      await page.waitForTimeout(1200);
      assert.equal(await page.locator("#timer").getAttribute("aria-label"), menuTime);
      await page.locator(`#${menu}-ok`).click();
      assert.equal(await page.locator("#pause-overlay").isVisible(), false);
      await page.waitForFunction((previous) =>
        document.querySelector("#timer").getAttribute("aria-label") !== previous,
      menuTime, { timeout: 3000 });

      await page.keyboard.press("p");
      await page.locator(`#btn-${menu}`).click();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#pause-overlay").isVisible(), true);
      await page.locator("#pause-resume").click();

      await page.locator(`#btn-${menu}`).click();
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await page.locator(`#${menu}-x`).click();
      assert.equal(await page.locator("#pause-overlay").isVisible(), true);
      await page.locator("#pause-resume").click();
    }
  }
});
