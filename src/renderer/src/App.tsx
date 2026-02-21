import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ContentArea } from "./components/ContentArea";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import { initialTabsState, tabsReducer } from "./tabsReducer";
import type {
  AppConfig,
  ContentWidthConfig,
  ContentWidthMode,
  FileData,
} from "./types";
import { useThemeStyles } from "./useThemeStyles";

const { mdview } = window;

export default function App(): JSX.Element {
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
  const mainRef = useRef<HTMLDivElement>(null);

  const activeTab =
    activeIndex >= 0 && activeIndex < tabs.length ? tabs[activeIndex] : null;

  const openFile = useCallback((data: FileData) => {
    dispatch({ type: "OPEN_FILE", data });
  }, []);

  const closeTab = useCallback(
    (index: number) => {
      if (index >= 0 && index < tabs.length) {
        mdview.closeFile(tabs[index].path);
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

  // Persist open files whenever the tab list changes
  const tabPaths = tabs.map((t) => t.path).join("\0");
  useEffect(() => {
    if (tabs.length > 0) {
      mdview.saveOpenFiles(tabs.map((t) => t.path));
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
      mdview.onFilesFromArgs((files: FileData[]) => {
        files.forEach((f) => openFile(f));
      }),
      mdview.onConfigLoaded((config: AppConfig) => {
        if (config.theme) {
          setTheme(config.theme);
        }
        if (config.containerFolders) {
          setContainerFolders(config.containerFolders);
        }
        if (config.contentWidth) {
          setContentWidth((prev) => ({ ...prev, ...config.contentWidth }));
        }
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [openFile]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeIndex >= 0) {
          closeTab(activeIndex);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        handleOpenDialog();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, closeTab, handleOpenDialog]);

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
          onResize={setSidebarWidth}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            mode={contentWidth.mode}
            widthValue={
              contentWidth.mode === "fixed"
                ? contentWidth.fixedWidth
                : contentWidth.cappedWidth
            }
            onChangeMode={changeContentWidthMode}
            onChangeWidthValue={changeContentWidthValue}
          />
          <ContentArea
            ref={mainRef}
            activeTab={activeTab}
            contentWidth={contentWidth}
            onDrop={handleDrop}
          />
        </div>
      </div>
      <StatusBar
        path={activeTab?.path ?? null}
        lastModifiedAt={activeTab?.lastModifiedAt ?? null}
      />
    </>
  );
}
