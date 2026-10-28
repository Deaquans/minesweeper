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
  const themeBtn = document.getElementById("btn-theme");
  const customOverlay = document.getElementById("custom-overlay");
  const customForm = document.getElementById("custom-form");
  const customWidthEl = document.getElementById("custom-width");
  const customHeightEl = document.getElementById("custom-height");
  const customMinesEl = document.getElementById("custom-mines");

  let config, cells, state, flagsPlaced, revealedCount, timerId, seconds;
  let customConfig = { rows: 9, cols: 9, mines: 10 };
  let lastDifficulty = difficultyEl.value;

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
      el.innerHTML = "";
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
    config = difficultyEl.value === "custom" ? { ...customConfig } : DIFFICULTIES[difficultyEl.value];
    state = "ready"; // ready | playing | won | lost
    flagsPlaced = 0;
    revealedCount = 0;
    stopTimer();
    seconds = 0;
    setCounter(timerEl, 0);
    resetBtn.textContent = "🙂";
    messageEl.textContent = "";

    cells = [];
    boardEl.innerHTML = "";
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
    if (cells.length - excluded.size < config.mines) excluded.clear(), excluded.add(safeCell);
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
        for (const n of neighbors(cell)) if (!n.revealed && !n.mine) stack.push(n);
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
    timerId = setInterval(() => {
      seconds++;
      setCounter(timerEl, seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

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
    if (state === "won" || state === "lost") return;
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
    if (state === "won" || state === "lost") return;
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
  function updateCustomMineLimit() {
    customMinesEl.max = String(Math.max(Number(customMinesEl.min), Number(customWidthEl.value) * Number(customHeightEl.value) - 9));
  }

  function hideCustomDialog() {
    customOverlay.hidden = true;
    difficultyEl.value = lastDifficulty;
    difficultyEl.focus();
  }

  difficultyEl.addEventListener("change", () => {
    if (difficultyEl.value === "custom") {
      customWidthEl.value = String(customConfig.cols);
      customHeightEl.value = String(customConfig.rows);
      customMinesEl.value = String(customConfig.mines);
      updateCustomMineLimit();
      customOverlay.hidden = false;
      customWidthEl.focus();
      return;
    }
    lastDifficulty = difficultyEl.value;
    newGame();
  });

  customWidthEl.addEventListener("input", updateCustomMineLimit);
  customHeightEl.addEventListener("input", updateCustomMineLimit);
  customForm.addEventListener("submit", (e) => {
    e.preventDefault();
    updateCustomMineLimit();
    if (!customForm.reportValidity()) return;

    customConfig = {
      cols: Number(customWidthEl.value),
      rows: Number(customHeightEl.value),
      mines: Number(customMinesEl.value),
    };
    lastDifficulty = "custom";
    customOverlay.hidden = true;
    difficultyEl.focus();
    newGame();
  });
  document.getElementById("custom-cancel").addEventListener("click", hideCustomDialog);
  document.getElementById("custom-x").addEventListener("click", hideCustomDialog);

  // ---- Window controls ----
  // When wrapped as a desktop app, expose `window.nativeWindow = { close, minimize, toggleMaximize }`
  // (e.g. from an Electron preload or Tauri) and these buttons will drive the real window instead.
  const native = window.nativeWindow;

  function closeWindow() {
    if (native?.close) return native.close();
    hideHelp();
    hideCustomDialog();
    windowEl.classList.remove("maximized");
    windowEl.hidden = true;
    taskbarEl.hidden = true;
    desktopIcon.hidden = false;
    desktopIcon.focus();
    newGame();
  }

  function minimizeWindow() {
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
    if (native?.toggleMaximize) return native.toggleMaximize();
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
    helpOverlay.hidden = false;
    document.getElementById("help-ok").focus();
  }

  function hideHelp() {
    helpOverlay.hidden = true;
  }

  document.getElementById("btn-help").addEventListener("click", showHelp);
  themeBtn.addEventListener("click", () => {
    const dark = document.body.dataset.theme !== "dark";
    document.body.dataset.theme = dark ? "dark" : "light";
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.title = `Switch to ${dark ? "light" : "dark"} theme`;
    themeBtn.textContent = `${dark ? "☀️" : "🌙"} Theme`;
  });
  document.getElementById("help-ok").addEventListener("click", hideHelp);
  document.getElementById("help-x").addEventListener("click", hideHelp);
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) hideHelp();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || windowEl.hidden) return;
    if (!customOverlay.hidden) {
      if (e.key === "Escape") hideCustomDialog();
      return;
    }
    if (!helpOverlay.hidden) {
      if (e.key === "Escape") hideHelp();
      return;
    }
    if (e.key === "r" || e.key === "R") newGame();
    if (e.key === "h" || e.key === "H" || e.key === "?") showHelp();
  });

  newGame();
})();
