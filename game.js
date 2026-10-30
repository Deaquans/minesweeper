(() => {
  "use strict";

  const DIFFICULTIES = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 },
  };

  const boardEl = document.getElementById("board");
  const mineCounterEl = document.getElementById("mine-counter");
  const timerEl = document.getElementById("timer");
  const resetBtn = document.getElementById("reset");
  const difficultyEl = document.getElementById("difficulty");
  const messageEl = document.getElementById("message");
  const windowEl = document.getElementById("window");
  const desktopIcon = document.getElementById("desktop-icon");
  const taskbarEl = document.getElementById("taskbar");
  const taskbarItem = document.getElementById("taskbar-item");
  const maximizeBtn = document.getElementById("btn-maximize");
  const helpOverlay = document.getElementById("help-overlay");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsCounterColor = document.getElementById("settings-counter-color");
  const themeBtn = document.getElementById("btn-theme");
  const pauseOverlay = document.getElementById("pause-overlay");
  const pauseResumeBtn = document.getElementById("pause-resume");
  const native = window.nativeWindow;

  if (native) {
    document.body.classList.add("native-app");
    maximizeBtn.disabled = true;
    maximizeBtn.title = "Maximize unavailable";
    maximizeBtn.setAttribute("aria-label", maximizeBtn.title);
    new ResizeObserver(() => {
      const bounds = windowEl.getBoundingClientRect();
      native.resize(Math.ceil(bounds.width), Math.ceil(bounds.height));
    }).observe(windowEl);
  }

  let config, cells, state, flagsPlaced, revealedCount, timerId, seconds;
  let timerElapsedMs = 0, timerStartedAt = null;

  const SEGMENTS = {
    0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg",
    5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g",
  };

  const pad = (n) => {
    n = Math.max(-99, Math.min(999, n));
    return n < 0 ? "-" + String(-n).padStart(2, "0") : String(n).padStart(3, "0");
  };

  // Renders a value as three 7-segment LED digits.
  function setCounter(el, value) {
    const text = pad(value);
    el.setAttribute("aria-label", `${el.title}: ${text}`);
    if (el.children.length !== 3) {
      el.replaceChildren();
      for (let i = 0; i < 3; i++) {
        const digit = document.createElement("div");
        digit.className = "digit";
        for (const s of "abcdefg") {
          const seg = document.createElement("span");
          seg.className = `seg ${s}`;
          digit.appendChild(seg);
        }
        el.appendChild(digit);
      }
    }
    [...text].forEach((ch, i) => {
      const lit = SEGMENTS[ch];
      for (const seg of el.children[i].children) {
        seg.classList.toggle("on", lit.includes(seg.classList[1]));
      }
    });
  }

  function newGame() {
    config = DIFFICULTIES[difficultyEl.value];
    state = "ready"; // ready | playing | paused | won | lost
    flagsPlaced = 0;
    revealedCount = 0;
    stopTimer();
    seconds = 0;
    timerElapsedMs = 0;
    timerStartedAt = null;
    setCounter(timerEl, 0);
    resetBtn.textContent = "🙂";
    messageEl.textContent = "";
    pauseOverlay.hidden = true;

    cells = [];
    boardEl.replaceChildren();
    boardEl.style.gridTemplateColumns = `repeat(${config.cols}, var(--cell-size))`;
    windowEl.style.setProperty("--board-cols", config.cols);

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "cell";
        el.dataset.index = cells.length;
        boardEl.appendChild(el);
        cells.push({ r, c, el, mine: false, adjacent: 0, revealed: false, flagged: false });
      }
    }
    updateMineCounter();
    fitBoard();
  }

  // Size cells so the whole board fits: normal windows cap at 28px, maximized ones grow to fill the screen.
  function fitBoard() {
    if (native) {
      const { width, height } = native.workArea;
      let size = 28;
      document.documentElement.style.setProperty("--cell-size", `${size}px`);
      while (size > 16) {
        const bounds = windowEl.getBoundingClientRect();
        const overflow = Math.max(
          Math.ceil((bounds.width - width) / config.cols),
          Math.ceil((bounds.height - height) / config.rows),
        );
        if (overflow <= 0) break;
        size = Math.max(16, size - overflow);
        document.documentElement.style.setProperty("--cell-size", `${size}px`);
      }
      return;
    }
    const maximized = windowEl.classList.contains("maximized");
    const byWidth = (window.innerWidth - (maximized ? 50 : 80)) / config.cols;
    const byHeight = (window.innerHeight - 215) / config.rows;
    const size = Math.floor(maximized ? Math.min(byWidth, byHeight) : byWidth);
    const max = maximized ? 64 : 28;
    document.documentElement.style.setProperty("--cell-size", `${Math.max(16, Math.min(max, size))}px`);
  }

  window.addEventListener("resize", fitBoard);

  const cellAt = (r, c) =>
    r >= 0 && r < config.rows && c >= 0 && c < config.cols ? cells[r * config.cols + c] : null;

  function neighbors(cell) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr || dc) {
          const n = cellAt(cell.r + dr, cell.c + dc);
          if (n) list.push(n);
        }
      }
    }
    return list;
  }

  // Mines are placed after the first click so the first click (and its neighbours) is always safe.
  function placeMines(safeCell) {
    const excluded = new Set([safeCell, ...neighbors(safeCell)]);
    if (cells.length - excluded.size < config.mines) {
      excluded.clear();
      excluded.add(safeCell);
    }
    const candidates = cells.filter((c) => !excluded.has(c));
    for (let i = 0; i < config.mines; i++) {
      const j = i + Math.floor(Math.random() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      candidates[i].mine = true;
    }
    for (const cell of cells) {
      cell.adjacent = neighbors(cell).filter((n) => n.mine).length;
    }
  }

  function reveal(start) {
    if (start.revealed || start.flagged) return;
    if (start.mine) return lose(start);

    const stack = [start];
    while (stack.length) {
      const cell = stack.pop();
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      revealedCount++;
      renderCell(cell);
      if (cell.adjacent === 0) {
        for (const neighbor of neighbors(cell)) {
          if (!neighbor.revealed && !neighbor.mine) stack.push(neighbor);
        }
      }
    }
    if (revealedCount === cells.length - config.mines) win();
  }

  function chord(cell) {
    const around = neighbors(cell);
    const flags = around.filter((n) => n.flagged).length;
    if (flags !== cell.adjacent) return;
    for (const n of around) {
      if (state !== "playing") return;
      reveal(n);
    }
  }

  function toggleFlag(cell) {
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flagsPlaced += cell.flagged ? 1 : -1;
    renderCell(cell);
    updateMineCounter();
  }

  function renderCell(cell) {
    const el = cell.el;
    el.className = "cell";
    el.textContent = "";
    if (cell.revealed) {
      el.classList.add("revealed");
      if (cell.mine) {
        el.classList.add("mine");
        el.textContent = "💣";
      } else if (cell.adjacent > 0) {
        el.classList.add("has-number", `n${cell.adjacent}`);
        el.textContent = cell.adjacent;
      }
    } else if (cell.flagged) {
      el.textContent = "🚩";
    }
  }

  function updateMineCounter() {
    setCounter(mineCounterEl, config.mines - flagsPlaced);
  }

  function startTimer() {
    if (timerId !== null || !helpOverlay.hidden || !settingsOverlay.hidden) return;
    timerStartedAt = Date.now();
    timerId = setInterval(() => {
      seconds = Math.floor((timerElapsedMs + Date.now() - timerStartedAt) / 1000);
      setCounter(timerEl, seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    if (timerStartedAt !== null) {
      timerElapsedMs += Date.now() - timerStartedAt;
      timerStartedAt = null;
      seconds = Math.floor(timerElapsedMs / 1000);
      setCounter(timerEl, seconds);
    }
  }

  function pauseGame(focusResume = true) {
    if (state !== "playing") return;
    state = "paused";
    stopTimer();
    pauseOverlay.hidden = false;
    if (focusResume) pauseResumeBtn.focus();
  }

  function resumeGame() {
    if (state !== "paused") return;
    state = "playing";
    pauseOverlay.hidden = true;
    startTimer();
    resetBtn.focus();
  }

  function togglePause() {
    if (state === "paused") resumeGame();
    else pauseGame();
  }

  function pauseOnDeactivate() {
    if (state === "playing") pauseGame(false);
  }

  window.addEventListener("blur", pauseOnDeactivate);
  if (native) native.onDeactivate(pauseOnDeactivate);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseOnDeactivate();
  });

  function lose(exploded) {
    state = "lost";
    stopTimer();
    resetBtn.textContent = "😵";
    messageEl.textContent = "Boom! Game over.";
    for (const cell of cells) {
      if (cell.mine && !cell.flagged) {
        cell.revealed = true;
        renderCell(cell);
      } else if (!cell.mine && cell.flagged) {
        cell.el.classList.add("wrong-flag");
        cell.el.textContent = "❌";
      }
    }
    exploded.el.classList.add("exploded");
  }

  function win() {
    state = "won";
    stopTimer();
    resetBtn.textContent = "😎";
    for (const cell of cells) {
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
        renderCell(cell);
      }
    }
    flagsPlaced = config.mines;
    updateMineCounter();

    const key = `minesweeper-best-${difficultyEl.value}`;
    const best = Number(localStorage.getItem(key)) || Infinity;
    if (seconds < best) {
      localStorage.setItem(key, seconds);
    }
    messageEl.textContent = `Time: ${seconds}s`;
  }

  function handlePrimary(cell) {
    if (state === "paused" || state === "won" || state === "lost") return;
    if (cell.revealed) return chord(cell);
    if (cell.flagged) return;
    if (state === "ready") {
      placeMines(cell);
      state = "playing";
      startTimer();
    }
    reveal(cell);
  }

  function handleSecondary(cell) {
    if (state === "paused" || state === "won" || state === "lost") return;
    toggleFlag(cell);
  }

  const cellFromEvent = (e) => {
    const el = e.target.closest(".cell");
    return el ? cells[Number(el.dataset.index)] : null;
  };

  boardEl.addEventListener("click", (e) => {
    const cell = cellFromEvent(e);
    if (!cell) return;
    // On macOS, Ctrl-click is delivered as contextmenu; Cmd-click is an extra flag shortcut.
    if (e.ctrlKey) return;
    if (e.metaKey) handleSecondary(cell);
    else handlePrimary(cell);
  });

  boardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (cell) handleSecondary(cell);
  });

  boardEl.addEventListener("mousedown", (e) => {
    if (e.button === 0 && (state === "ready" || state === "playing")) resetBtn.textContent = "😮";
  });
  document.addEventListener("mouseup", () => {
    if (state === "ready" || state === "playing") resetBtn.textContent = "🙂";
  });

  resetBtn.addEventListener("click", newGame);

  difficultyEl.addEventListener("change", newGame);
  pauseResumeBtn.addEventListener("click", resumeGame);

  // ---- Window controls ----
  function closeWindow() {
    if (native?.close) return native.close();
    hideHelp();
    hideSettings();
    windowEl.classList.remove("maximized");
    windowEl.hidden = true;
    taskbarEl.hidden = true;
    desktopIcon.hidden = false;
    desktopIcon.focus();
    newGame();
  }

  function minimizeWindow() {
    pauseOnDeactivate();
    if (native?.minimize) return native.minimize();
    windowEl.hidden = true;
    taskbarEl.hidden = false;
    taskbarItem.focus();
  }

  function restoreWindow() {
    windowEl.hidden = false;
    taskbarEl.hidden = true;
    desktopIcon.hidden = true;
    fitBoard();
  }

  function toggleMaximize() {
    if (native) return;
    const on = windowEl.classList.toggle("maximized");
    maximizeBtn.title = on ? "Restore" : "Maximize";
    maximizeBtn.setAttribute("aria-label", maximizeBtn.title);
    fitBoard();
  }

  document.getElementById("btn-close").addEventListener("click", closeWindow);
  document.getElementById("btn-minimize").addEventListener("click", minimizeWindow);
  maximizeBtn.addEventListener("click", toggleMaximize);
  windowEl.querySelector(".title-bar").addEventListener("dblclick", (e) => {
    if (!e.target.closest("button")) toggleMaximize();
  });
  taskbarItem.addEventListener("click", restoreWindow);
  desktopIcon.addEventListener("dblclick", restoreWindow);
  desktopIcon.addEventListener("keydown", (e) => {
    if (e.key === "Enter") restoreWindow();
  });

  // ---- Help dialog ----
  function showHelp() {
    if (state === "playing") stopTimer();
    helpOverlay.hidden = false;
    document.getElementById("help-ok").focus();
  }

  function hideHelp() {
    helpOverlay.hidden = true;
    if (state === "playing") startTimer();
  }

  document.getElementById("btn-help").addEventListener("click", showHelp);
  function setTheme(dark) {
    document.body.dataset.theme = dark ? "dark" : "light";
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.title = `Switch to ${dark ? "light" : "dark"} theme`;
    themeBtn.textContent = `${dark ? "☀️" : "🌙"} Theme`;
  }

  function saveSettings() {
    try {
      localStorage.setItem("minesweeper-settings", JSON.stringify({
        theme: document.body.dataset.theme === "dark" ? "dark" : "light",
        counterColor: settingsCounterColor.value,
      }));
    } catch (error) {
      console.error("Unable to save Minesweeper settings:", error);
      messageEl.textContent = "Unable to save settings. They may reset when you reopen the app.";
    }
  }

  function restoreSettings() {
    try {
      const saved = localStorage.getItem("minesweeper-settings");
      if (saved === null) return;
      const settings = JSON.parse(saved);
      if (!settings || !["light", "dark"].includes(settings.theme) ||
          ![...settingsCounterColor.options].some((option) => option.value === settings.counterColor)) {
        throw new Error("Invalid saved theme or counter color");
      }
      setTheme(settings.theme === "dark");
      settingsCounterColor.value = settings.counterColor;
      document.body.dataset.counterColor = settings.counterColor;
    } catch (error) {
      console.error("Unable to restore Minesweeper settings:", error);
      messageEl.textContent = "Unable to restore saved settings. Please choose them again.";
    }
  }

  themeBtn.addEventListener("click", () => {
    setTheme(document.body.dataset.theme !== "dark");
    saveSettings();
  });
  settingsCounterColor.addEventListener("change", () => {
    document.body.dataset.counterColor = settingsCounterColor.value;
    saveSettings();
  });
  document.getElementById("help-ok").addEventListener("click", hideHelp);
  document.getElementById("help-x").addEventListener("click", hideHelp);
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) hideHelp();
  });

  function showSettings() {
    if (state === "playing") stopTimer();
    settingsOverlay.hidden = false;
    settingsCounterColor.focus();
  }

  function hideSettings() {
    settingsOverlay.hidden = true;
    if (state === "playing") startTimer();
    document.getElementById("btn-settings").focus();
  }

  document.getElementById("btn-settings").addEventListener("click", showSettings);
  document.getElementById("settings-ok").addEventListener("click", hideSettings);
  document.getElementById("settings-x").addEventListener("click", hideSettings);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) hideSettings();
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.repeat || windowEl.hidden) return;
    if (!helpOverlay.hidden) {
      if (e.key === "Escape") hideHelp();
      return;
    }
    if (!settingsOverlay.hidden) {
      if (e.key === "Escape") hideSettings();
      return;
    }
    if (e.target.matches("input, select, textarea")) return;
    const key = e.key.toLowerCase();
    if (key === "r") newGame();
    if (key === "h" || key === "?") showHelp();
    if (key === "p") togglePause();
  });

  newGame();
  restoreSettings();
})();
