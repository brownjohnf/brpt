import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { ContentArea } from "./components/ContentArea";
import { DEFAULT_DRAWER_WIDTH, NotificationDrawer } from "./components/NotificationDrawer";
import { QuickGoto } from "./components/QuickGoto";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { DrawerToggle, SidebarToggle, TopBar } from "./components/TopBar";
import {
  DiffContent,
  DiffTopBarContent,
  diffCapabilities,
  useDiffViewMode,
} from "./components/viewers/DiffViewer";
import {
  MarkdownContent,
  MarkdownTopBarContent,
  markdownCapabilities,
} from "./components/viewers/MarkdownViewer";
import { initialTabsState, tabsReducer } from "./tabsReducer";
import type {
  AnnotationData,
  AppConfig,
  ContentWidthConfig,
  ContentWidthMode,
  DiffData,
  DiffTab,
  FileData,
  OpenEntry,
  OpenFileEntry,
  ProjectEntry,
  SavedDiff,
} from "./types";
import { groupTabs } from "./groupTabs";
import { useThemeStyles } from "./useThemeStyles";

const { mdview } = window;

export default function App(): ReactNode {
  const [{ tabs, activeIndex }, dispatch] = useReducer(
    tabsReducer,
    initialTabsState,
  );
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [containerFolders, setContainerFolders] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [contentWidth, setContentWidth] = useState<ContentWidthConfig>({
    mode: "fixed",
    fixedWidth: "880px",
    cappedWidth: "1200px",
  });
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(270);
  const [quickGotoOpen, setQuickGotoOpen] = useState(false);
  const [quickGotoHighlight, setQuickGotoHighlight] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH);
  const mainRef = useRef<HTMLDivElement>(null);
  const configLoaded = useRef(false);
  const recentlyClosed = useRef<OpenEntry[]>([]);

  const activeTab =
    activeIndex >= 0 && activeIndex < tabs.length ? tabs[activeIndex] : null;

  const capabilities = useMemo(() => {
    if (!activeTab) { return {}; }
    if (activeTab.kind === "markdown") { return markdownCapabilities(activeTab); }
    if (activeTab.kind === "diff") { return diffCapabilities(activeTab); }
    return {};
  }, [activeTab]);

  const [diffViewMode, setDiffViewMode] = useDiffViewMode();

  const openFile = useCallback((data: FileData) => {
    dispatch({ type: "OPEN_FILE", data });
  }, []);

  const openDiff = useCallback((data: DiffData) => {
    dispatch({ type: "OPEN_DIFF", data });
  }, []);

  const closeTab = useCallback(
    (index: number) => {
      if (index >= 0 && index < tabs.length) {
        const tab = tabs[index];
        let inner: string | SavedDiff;
        if (tab.kind === "diff") {
          const dt = tab as DiffTab;
          inner = dt.mode === "diff"
            ? { type: "diff" as const, file: dt.path, diffFile: dt.secondPath }
            : { type: "diff-by-files" as const, file: dt.path, oldFile: dt.secondPath };
        } else {
          inner = tab.path;
        }
        const entry: OpenEntry = (tab.annotationPath || typeof inner !== "string")
          ? { entry: inner, ...(tab.annotationPath && { annotationFile: tab.annotationPath }) }
          : inner;
        recentlyClosed.current.push(entry);
        if (recentlyClosed.current.length > 20) {
          recentlyClosed.current.shift();
        }
        mdview.closeFile(tab.path, tab.annotationPath);
      }
      dispatch({ type: "CLOSE_TAB", index });
    },
    [tabs],
  );

  const activateTab = useCallback(
    (index: number) => {
      dispatch({
        type: "ACTIVATE_TAB",
        index,
        currentScrollTop: mainRef.current?.scrollTop ?? 0,
      });
    },
    [],
  );

  const changeContentWidthMode = useCallback((mode: ContentWidthMode) => {
    setContentWidth((prev) => {
      const next = { ...prev, mode };
      mdview.setConfig("contentWidth", next);
      return next;
    });
  }, []);

  const changeContentWidthValue = useCallback((value: string) => {
    setContentWidth((prev) => {
      const key = prev.mode === "fixed" ? "fixedWidth" : "cappedWidth";
      const next = { ...prev, [key]: value };
      mdview.setConfig("contentWidth", next);
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      mdview.setConfig("theme", next);
      return next;
    });
  }, []);

  const handleRetryRemoved = useCallback(
    async (path: string) => {
      const result = await mdview.requestFile(path);
      if (result) {
        openFile(result);
      } else {
        toast.error("File not found");
      }
    },
    [openFile],
  );

  const reorderTab = useCallback(
    (fromIndex: number, toIndex: number) => {
      dispatch({ type: "REORDER_TAB", fromIndex, toIndex });
    },
    [],
  );

  const reorderGroup = useCallback(
    (fromName: string, toName: string) => {
      setGroupOrder((prev) => {
        // Build the full order: start with prev, append any groups not yet listed
        const allGroupNames = groupTabs(tabs, projects, containerFolders, prev)
          .grouped.map((g) => g.name);
        const full = [...prev];
        for (const name of allGroupNames) {
          if (!full.includes(name)) {
            full.push(name);
          }
        }

        const fromIdx = full.indexOf(fromName);
        const toIdx = full.indexOf(toName);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
          return prev;
        }

        const next = [...full];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);

        // Cap at 50, pruning stale entries from the tail
        const activeNames = new Set(allGroupNames);
        while (next.length > 50) {
          const staleIdx = next.findLastIndex((n) => !activeNames.has(n));
          if (staleIdx === -1) { break; }
          next.splice(staleIdx, 1);
        }

        mdview.setConfig("groupOrder", next);
        return next;
      });
    },
    [tabs, projects, containerFolders],
  );

  const sidebarSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSidebarResize = useCallback((width: number) => {
    setSidebarWidth(width);
    if (sidebarSaveTimer.current) {
      clearTimeout(sidebarSaveTimer.current);
    }
    sidebarSaveTimer.current = setTimeout(() => {
      mdview.setConfig("sidebarWidth", width);
    }, 300);
  }, []);

  const drawerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDrawerResize = useCallback((width: number) => {
    setDrawerWidth(width);
    if (drawerSaveTimer.current) {
      clearTimeout(drawerSaveTimer.current);
    }
    drawerSaveTimer.current = setTimeout(() => {
      mdview.setConfig("drawerWidth", width);
    }, 300);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
  }, []);

  const handleOpenDialog = useCallback(async () => {
    const files = await mdview.openFileDialog();
    files.forEach((f: FileData) => openFile(f));
  }, [openFile]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.endsWith(".md"),
      );
      for (const file of files) {
        const result = await mdview.requestFile(file.path);
        if (result) {
          openFile(result);
        }
      }
    },
    [openFile],
  );

  // Load notifications for newly opened tabs
  const loadedNotificationPaths = useRef(new Set<string>());
  useEffect(() => {
    for (const tab of tabs) {
      if (!loadedNotificationPaths.current.has(tab.path)) {
        loadedNotificationPaths.current.add(tab.path);
        mdview.getNotifications(tab.path).then((notifications) => {
          if (notifications.length > 0) {
            dispatch({ type: "SET_NOTIFICATIONS", path: tab.path, notifications });
          }
        });
      }
    }
  }, [tabs]);

  // Persist open tabs whenever the tab list changes
  const tabPaths = tabs.map((t) => t.path).join("\0");
  useEffect(() => {
    if (configLoaded.current) {
      const entries: OpenEntry[] = tabs
        .filter((t) => !t.removed)
        .map((t) => {
          let inner: string | SavedDiff;
          if (t.kind === "diff") {
            const dt = t as DiffTab;
            inner = dt.mode === "diff"
              ? { type: "diff" as const, file: dt.path, diffFile: dt.secondPath }
              : { type: "diff-by-files" as const, file: dt.path, oldFile: dt.secondPath };
          } else {
            inner = t.path;
          }

          if (t.annotationPath || typeof inner !== "string") {
            const envelope: OpenFileEntry = { entry: inner };
            if (t.annotationPath) {
              envelope.annotationFile = t.annotationPath;
            }
            return envelope;
          }
          return inner;
        });
      mdview.saveOpenFiles(entries);
    }
  }, [tabPaths]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore scroll position when active tab changes
  useEffect(() => {
    if (mainRef.current && activeTab) {
      mainRef.current.scrollTop = activeTab.scrollTop;
    }
  }, [activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark notifications as read when the drawer is open and the active tab has unread notifications
  useEffect(() => {
    if (drawerOpen && activeTab && activeTab.unreadNotificationCount > 0) {
      mdview.markNotificationsRead(activeTab.path);
      dispatch({ type: "MARK_NOTIFICATIONS_READ", path: activeTab.path });
    }
  }, [drawerOpen, activeTab?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist active file to config
  useEffect(() => {
    if (configLoaded.current && activeTab) {
      mdview.setConfig("activeFile", activeTab.path);
    }
  }, [activeTab?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyConfig = useCallback((config: AppConfig) => {
    configLoaded.current = true;
    if (config.theme) { setTheme(config.theme); }
    if (config.containerFolders) { setContainerFolders(config.containerFolders); }
    if (config.projects) { setProjects(config.projects); }
    if (config.groupOrder) { setGroupOrder(config.groupOrder); }
    if (config.contentWidth) { setContentWidth((prev) => ({ ...prev, ...config.contentWidth })); }
    if (config.sidebarWidth != null) { setSidebarWidth(config.sidebarWidth); }
    if (config.drawerWidth != null) { setDrawerWidth(config.drawerWidth); }
  }, []);

  // IPC listeners
  useEffect(() => {
    const unsubs = [
      mdview.onFileUpdated((data: FileData) => {
        dispatch({ type: "FILE_UPDATED", data });
      }),
      mdview.onFileRemoved(({ path }) => {
        dispatch({ type: "FILE_REMOVED", path });
      }),
      mdview.onFilesFromArgs((files: FileData[]) => {
        files.forEach((f) => openFile(f));
      }),
      mdview.onDiffFromArgs((data: DiffData) => {
        openDiff(data);
      }),
      mdview.onDiffUpdated((data: DiffData) => {
        dispatch({ type: "DIFF_UPDATED", data });
      }),
      mdview.onAnnotationsFromArgs((data: AnnotationData) => {
        dispatch({
          type: "SET_ANNOTATIONS",
          targetPath: data.targetPath,
          annotationPath: data.annotationPath,
          annotations: data.annotations,
        });
      }),
      mdview.onAnnotationsUpdated((data: AnnotationData) => {
        dispatch({
          type: "SET_ANNOTATIONS",
          targetPath: data.targetPath,
          annotationPath: data.annotationPath,
          annotations: data.annotations,
        });
      }),
      mdview.onNotificationReceived(({ targetPath, notification }) => {
        dispatch({ type: "ADD_NOTIFICATION", path: targetPath, notification });
      }),
      mdview.onConfigLoaded(applyConfig),
      mdview.onActivateFile((path: string) => {
        dispatch({ type: "ACTIVATE_FILE_BY_PATH", path });
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [openFile, openDiff, applyConfig]);

  useEffect(() => {
    mdview.getConfig().then(applyConfig);
  }, [applyConfig]);

  // Keyboard shortcuts
  useEffect(() => {
    function* iterateVisualTabs(): Generator<number> {
      const { grouped, ungrouped } = groupTabs(tabs, projects, containerFolders, groupOrder);
      for (const group of grouped) {
        for (const { index } of group.tabs) {
          yield index;
        }
      }
      for (const { index } of ungrouped) {
        yield index;
      }
    }

    function nthVisualTab(n: number): number | null {
      let i = 0;
      for (const index of iterateVisualTabs()) {
        if (i === n) {
          return index;
        }
        i++;
      }
      return null;
    }

    function lastVisualTab(): number | null {
      let last: number | null = null;
      for (const index of iterateVisualTabs()) {
        last = index;
      }
      return last;
    }

    function adjacentVisualTab(direction: -1 | 1): number | null {
      let prev: number | null = null;
      let first: number | null = null;
      let returnNext = false;
      for (const index of iterateVisualTabs()) {
        if (first === null) {
          first = index;
        }
        if (returnNext) {
          return index;
        }
        if (index === activeIndex) {
          if (direction === -1) {
            return prev ?? lastVisualTab();
          }
          returnNext = true;
        }
        prev = index;
      }
      if (returnNext) {
        return first;
      }
      return null;
    }

    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "w") {
        e.preventDefault();
        if (activeIndex >= 0) {
          closeTab(activeIndex);
        }
        return;
      }
      if (mod && e.key === "o") {
        e.preventDefault();
        handleOpenDialog();
        return;
      }
      if (mod && e.shiftKey && e.key === "t") {
        e.preventDefault();
        const entry = recentlyClosed.current.pop();
        if (entry) {
          const inner = typeof entry === "string" ? entry : entry.entry;
          const annotationFile = typeof entry === "string" ? undefined : entry.annotationFile;
          if (typeof inner === "string") {
            mdview.requestFile(inner).then((result) => {
              if (result) {
                openFile(result);
                if (annotationFile) {
                  mdview.requestAnnotations(inner, annotationFile);
                }
              }
            });
          } else if (inner.type === "diff") {
            mdview.requestDiff(inner.file, inner.diffFile).then((result) => {
              if (result) {
                openDiff(result);
                if (annotationFile) {
                  mdview.requestAnnotations(inner.file, annotationFile);
                }
              }
            });
          } else if (inner.type === "diff-by-files") {
            mdview.requestDiffByFiles(inner.file, inner.oldFile).then((result) => {
              if (result) {
                openDiff(result);
                if (annotationFile) {
                  mdview.requestAnnotations(inner.file, annotationFile);
                }
              }
            });
          }
        }
        return;
      }
      if (mod && e.key === "t") {
        e.preventDefault();
        setQuickGotoOpen((prev) => !prev);
        return;
      }
      if (mod && e.shiftKey && e.key === "[") {
        e.preventDefault();
        const target = adjacentVisualTab(-1);
        if (target != null) {
          activateTab(target);
        }
        return;
      }
      if (mod && e.shiftKey && e.key === "]") {
        e.preventDefault();
        const target = adjacentVisualTab(1);
        if (target != null) {
          activateTab(target);
        }
        return;
      }
      if (mod && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const target = e.key === "9"
          ? lastVisualTab()
          : nthVisualTab(parseInt(e.key, 10) - 1);
        if (target != null) {
          activateTab(target);
        }
        return;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, tabs, projects, containerFolders, groupOrder, closeTab, handleOpenDialog, activateTab, openFile]);

  // Apply theme to document and toggle stylesheets
  useThemeStyles(theme);
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <>
      <div
        className="flex h-[calc(100vh-28px)]"
        style={{ background: "var(--bg)" }}
      >
        <Sidebar
          tabs={tabs}
          activeIndex={activeIndex}
          highlightedIndex={quickGotoHighlight}
          projects={projects}
          containerFolders={containerFolders}
          groupOrder={groupOrder}
          width={sidebarWidth}
          open={sidebarOpen}
          onActivateTab={activateTab}
          onCloseTab={closeTab}
          onOpenDialog={handleOpenDialog}
          onToggleTheme={toggleTheme}
          onDrop={handleDrop}
          onResize={handleSidebarResize}
          onReorderTab={reorderTab}
          onReorderGroup={reorderGroup}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            left={
              <SidebarToggle
                sidebarOpen={sidebarOpen}
                onToggleSidebar={toggleSidebar}
              />
            }
            right={
              <DrawerToggle
                drawerOpen={drawerOpen}
                unreadNotificationCount={activeTab?.unreadNotificationCount ?? 0}
                onToggleDrawer={toggleDrawer}
              />
            }
          >
            {activeTab?.kind === "markdown" && (
              <MarkdownTopBarContent
                scrollRef={mainRef}
                content={activeTab.content}
                contentWidth={contentWidth}
                onChangeMode={changeContentWidthMode}
                onChangeWidthValue={changeContentWidthValue}
              />
            )}
            {activeTab?.kind === "diff" && (
              <DiffTopBarContent
                tab={activeTab}
                viewMode={diffViewMode}
                onChangeViewMode={setDiffViewMode}
              />
            )}
          </TopBar>
          <div className="flex-1 flex overflow-hidden">
            <ContentArea
              ref={mainRef}
              activeTab={activeTab}
              onDrop={handleDrop}
            >
              {activeTab?.kind === "markdown" && (
                <MarkdownContent
                  tab={activeTab}
                  contentWidth={contentWidth}
                  onRetryRemoved={handleRetryRemoved}
                />
              )}
              {activeTab?.kind === "diff" && (
                <DiffContent
                  tab={activeTab}
                  viewMode={diffViewMode}
                />
              )}
            </ContentArea>
            <NotificationDrawer
              open={drawerOpen}
              width={drawerWidth}
              onResize={handleDrawerResize}
              notifications={activeTab?.notifications ?? []}
            />
          </div>
        </div>
      </div>
      <StatusBar
        path={activeTab?.path ?? null}
        lastModifiedAt={activeTab?.lastModifiedAt ?? null}
        draggablePath={capabilities.draggablePath}
      />
      <Toaster theme={theme} position="bottom-center" style={{ bottom: "28px" }} />
      {quickGotoOpen && (
        <QuickGoto
          tabs={tabs}
          onActivateTab={activateTab}
          onHighlight={setQuickGotoHighlight}
          onClose={() => setQuickGotoOpen(false)}
        />
      )}
    </>
  );
}
