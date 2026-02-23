import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { ContentArea } from "./components/ContentArea";
import { QuickGoto } from "./components/QuickGoto";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import {
  DiffContent,
  DiffTopBarContent,
  useDiffViewMode,
} from "./components/viewers/DiffViewer";
import {
  MarkdownContent,
  MarkdownTopBarContent,
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
  const [contentWidth, setContentWidth] = useState<ContentWidthConfig>({
    mode: "fixed",
    fixedWidth: "880px",
    cappedWidth: "1200px",
  });
  const [sidebarWidth, setSidebarWidth] = useState(270);
  const [quickGotoOpen, setQuickGotoOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const configLoaded = useRef(false);
  const recentlyClosed = useRef<OpenEntry[]>([]);

  const activeTab =
    activeIndex >= 0 && activeIndex < tabs.length ? tabs[activeIndex] : null;

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
      mdview.onConfigLoaded((config: AppConfig) => {
        configLoaded.current = true;
        if (config.theme) {
          setTheme(config.theme);
        }
        if (config.containerFolders) {
          setContainerFolders(config.containerFolders);
        }
        if (config.contentWidth) {
          setContentWidth((prev) => ({ ...prev, ...config.contentWidth }));
        }
        if (config.sidebarWidth != null) {
          setSidebarWidth(config.sidebarWidth);
        }
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [openFile, openDiff]);

  // Keyboard shortcuts
  useEffect(() => {
    function* iterateVisualTabs(): Generator<number> {
      const { grouped, ungrouped } = groupTabs(tabs, containerFolders);
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
  }, [activeIndex, tabs, containerFolders, closeTab, handleOpenDialog, activateTab, openFile]);

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
          containerFolders={containerFolders}
          width={sidebarWidth}
          onActivateTab={activateTab}
          onCloseTab={closeTab}
          onOpenDialog={handleOpenDialog}
          onToggleTheme={toggleTheme}
          onDrop={handleDrop}
          onResize={handleSidebarResize}
          onReorderTab={reorderTab}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar>
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
        </div>
      </div>
      <StatusBar
        path={activeTab?.path ?? null}
        lastModifiedAt={activeTab?.lastModifiedAt ?? null}
      />
      <Toaster theme={theme} position="bottom-center" style={{ bottom: "28px" }} />
      {quickGotoOpen && (
        <QuickGoto
          tabs={tabs}
          onActivateTab={activateTab}
          onClose={() => setQuickGotoOpen(false)}
        />
      )}
    </>
  );
}
