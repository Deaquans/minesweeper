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
    await page.waitForFunction(() => {
      const bounds = document.querySelector("#window").getBoundingClientRect();
      return Math.ceil(bounds.width) === innerWidth && Math.ceil(bounds.height) === innerHeight;
    });
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
