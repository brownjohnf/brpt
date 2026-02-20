/* global mdview */

const tabs = []; // { path, content, scrollTop }
let activeIndex = -1;

const tabListEl = document.getElementById("tab-list");
const contentEl = document.getElementById("content");
const statusTextEl = document.getElementById("status-text");
const addBtn = document.getElementById("add-btn");
const themeToggle = document.getElementById("theme-toggle");
const mainEl = document.getElementById("main");
const sidebarEl = document.getElementById("sidebar");

function getFilename(filePath) {
  return filePath.split("/").pop();
}

function renderTabs() {
  tabListEl.innerHTML = "";
  tabs.forEach((tab, i) => {
    const el = document.createElement("div");
    el.className = "tab" + (i === activeIndex ? " active" : "");

    const nameEl = document.createElement("span");
    nameEl.className = "tab-name";
    nameEl.textContent = getFilename(tab.path);
    nameEl.title = tab.path;
    el.appendChild(nameEl);

    const closeEl = document.createElement("button");
    closeEl.className = "tab-close";
    closeEl.textContent = "\u00d7";
    closeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(i);
    });
    el.appendChild(closeEl);

    el.addEventListener("click", () => {
      activateTab(i);
    });

    tabListEl.appendChild(el);
  });
}

function activateTab(index) {
  if (index < 0 || index >= tabs.length) {
    activeIndex = -1;
    contentEl.innerHTML = "";
    statusTextEl.textContent = "";
    renderTabs();
    return;
  }

  // Save scroll position of current tab
  if (activeIndex >= 0 && activeIndex < tabs.length) {
    tabs[activeIndex].scrollTop = mainEl.scrollTop;
  }

  activeIndex = index;
  const tab = tabs[index];
  contentEl.innerHTML = mdview.renderMarkdown(tab.content);
  statusTextEl.textContent = "Watching: " + tab.path;
  renderTabs();

  // Restore scroll position
  mainEl.scrollTop = tab.scrollTop || 0;
}

function findTabIndex(filePath) {
  return tabs.findIndex((t) => t.path === filePath);
}

function openFile(filePath, content) {
  const existing = findTabIndex(filePath);
  if (existing !== -1) {
    tabs[existing].content = content;
    activateTab(existing);
    return;
  }

  tabs.push({ path: filePath, content, scrollTop: 0 });
  activateTab(tabs.length - 1);
  persistOpenFiles();
}

function closeTab(index) {
  if (index < 0 || index >= tabs.length) {
    return;
  }

  const tab = tabs[index];
  mdview.closeFile(tab.path);
  tabs.splice(index, 1);

  if (tabs.length === 0) {
    activateTab(-1);
  } else if (activeIndex >= tabs.length) {
    activateTab(tabs.length - 1);
  } else if (index <= activeIndex) {
    activateTab(Math.max(0, activeIndex - 1));
  } else {
    renderTabs();
  }

  persistOpenFiles();
}

function persistOpenFiles() {
  mdview.saveOpenFiles(tabs.map((t) => t.path));
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);

  const lightMd = document.getElementById("markdown-theme-light");
  const darkMd = document.getElementById("markdown-theme-dark");
  const lightHljs = document.getElementById("hljs-theme-light");
  const darkHljs = document.getElementById("hljs-theme-dark");

  if (theme === "dark") {
    lightMd.disabled = true;
    darkMd.disabled = false;
    lightHljs.disabled = true;
    darkHljs.disabled = false;
  } else {
    lightMd.disabled = false;
    darkMd.disabled = true;
    lightHljs.disabled = false;
    darkHljs.disabled = true;
  }
}

/** IPC: file content updated from watcher */
mdview.onFileUpdated((data) => {
  const index = findTabIndex(data.path);
  if (index === -1) {
    return;
  }
  tabs[index].content = data.content;
  if (index === activeIndex) {
    const scrollPos = mainEl.scrollTop;
    contentEl.innerHTML = mdview.renderMarkdown(data.content);
    mainEl.scrollTop = scrollPos;
  }
});

/** IPC: files from CLI args or second instance */
mdview.onFilesFromArgs((files) => {
  files.forEach((f) => openFile(f.path, f.content));
});

/** IPC: config loaded on startup */
mdview.onConfigLoaded((config) => {
  if (config.theme) {
    applyTheme(config.theme);
  }
});

/** Add button — open file picker */
addBtn.addEventListener("click", async () => {
  const files = await mdview.openFileDialog();
  files.forEach((f) => openFile(f.path, f.content));
});

/** Theme toggle */
themeToggle.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  mdview.setConfig("theme", next);
});

/** Drag-and-drop */
sidebarEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  sidebarEl.classList.add("drag-over");
});

sidebarEl.addEventListener("dragleave", () => {
  sidebarEl.classList.remove("drag-over");
});

sidebarEl.addEventListener("drop", async (e) => {
  e.preventDefault();
  sidebarEl.classList.remove("drag-over");

  const files = Array.from(e.dataTransfer.files).filter((f) =>
    f.name.endsWith(".md"),
  );

  for (const file of files) {
    const result = await mdview.requestFile(file.path);
    if (result) {
      openFile(result.path, result.content);
    }
  }
});

/** Also allow dropping on main area */
mainEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

mainEl.addEventListener("drop", async (e) => {
  e.preventDefault();

  const files = Array.from(e.dataTransfer.files).filter((f) =>
    f.name.endsWith(".md"),
  );

  for (const file of files) {
    const result = await mdview.requestFile(file.path);
    if (result) {
      openFile(result.path, result.content);
    }
  }
});

/** Keyboard shortcuts */
document.addEventListener("keydown", (e) => {
  // Cmd+W / Ctrl+W — close active tab
  if ((e.metaKey || e.ctrlKey) && e.key === "w") {
    e.preventDefault();
    if (activeIndex >= 0) {
      closeTab(activeIndex);
    }
  }

  // Cmd+O / Ctrl+O — open file
  if ((e.metaKey || e.ctrlKey) && e.key === "o") {
    e.preventDefault();
    addBtn.click();
  }
});
