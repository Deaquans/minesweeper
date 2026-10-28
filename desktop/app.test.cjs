const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { _electron: electron } = require("playwright");

test("desktop window fits the game and native controls work", { timeout: 60000 }, async (t) => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.MINESWEEPER_EXECUTABLE,
    args: process.env.MINESWEEPER_EXECUTABLE ? [] : [path.join(__dirname, "..")],
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
      fullscreenable: window.isFullScreenable()
    };
  });
  assert.deepEqual(settings, { resizable: false, maximizable: false, fullscreenable: false });

  await page.locator("#window > .title-bar .title").dblclick();
  assert.equal(await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isMaximized()), false);

  await page.locator("#difficulty").selectOption("expert");
  assert.equal(await page.locator(".cell").count(), 480);
  await assertFits();
  await page.locator("#difficulty").selectOption("custom");
  await page.locator("#custom-width").fill("5");
  await page.locator("#custom-height").fill("5");
  await page.locator("#custom-mines").fill("5");
  await page.locator("#custom-form button[type=submit]").click();
  assert.equal(await page.locator(".cell").count(), 25);
  await assertFits();

  const first = page.locator(".cell").first();
  await first.click({ button: "right" });
  assert.equal(await first.textContent(), "🚩");
  await first.click({ button: "right" });
  await first.click();
  assert.equal(await first.evaluate((el) => el.classList.contains("revealed")), true);
  await page.locator("#btn-theme").click();
  await assertFits();
  await page.keyboard.press("h");
  assert.equal(await page.locator("#help-overlay").isVisible(), true);
  await page.locator("#help-ok").click();

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
  await page.locator("#btn-close").click();
  assert.equal(await exited, 0);
});
