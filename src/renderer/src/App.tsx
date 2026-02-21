import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { ContentArea } from "./components/ContentArea";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import type {
  AppConfig,
  ContentWidthConfig,
  ContentWidthMode,
  FileData,
  Tab,
} from "./types";
import { useThemeStyles } from "./useThemeStyles";

const { mdview } = window;

export default function App(): JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
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

  const persistOpenFiles = useCallback((currentTabs: Tab[]) => {
    mdview.saveOpenFiles(currentTabs.map((t) => t.path));
  }, []);

  const openFile = useCallback(
    (data: FileData) => {
      setTabs((prev) => {
        const existing = prev.findIndex((t) => t.path === data.path);
        if (existing !== -1) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], content: data.content };
          setActiveIndex(existing);
          return updated;
        }
        const next: Tab[] = [
          ...prev,
          {
            path: data.path,
            content: data.content,
            mtimeMs: data.mtimeMs,
            scrollTop: 0,
            lastModifiedAt: Temporal.Instant.fromEpochMilliseconds(Math.floor(data.mtimeMs)),
            hasUnseenChanges: false,
          },
        ];
        setActiveIndex(next.length - 1);
        persistOpenFiles(next);
        return next;
      });
    },
    [persistOpenFiles]
  );

  const closeTab = useCallback(
    (index: number) => {
      setTabs((prev) => {
        if (index < 0 || index >= prev.length) {
          return prev;
        }
        mdview.closeFile(prev[index].path);
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          setActiveIndex(-1);
        } else if (activeIndex >= next.length) {
          setActiveIndex(next.length - 1);
        } else if (index <= activeIndex) {
          setActiveIndex(Math.max(0, activeIndex - 1));
        }
        persistOpenFiles(next);
        return next;
      });
    },
    [activeIndex, persistOpenFiles]
  );

  const activateTab = useCallback(
    (index: number) => {
      // Save current scroll position before switching
      if (mainRef.current && activeIndex >= 0) {
        setTabs((prev) => {
          const updated = [...prev];
          if (updated[activeIndex]) {
            updated[activeIndex] = {
              ...updated[activeIndex],
              scrollTop: mainRef.current?.scrollTop ?? 0,
            };
          }
          return updated;
        });
      }
      setTabs((prev) => {
        if (!prev[index] || !prev[index].hasUnseenChanges) {
          return prev;
        }
        const updated = [...prev];
        updated[index] = { ...updated[index], hasUnseenChanges: false };
        return updated;
      });
      setActiveIndex(index);
    },
    [activeIndex]
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
        f.name.endsWith(".md")
      );
      for (const file of files) {
        const result = await mdview.requestFile(file.path);
        if (result) {
          openFile(result);
        }
      }
    },
    [openFile]
  );

  // Restore scroll position when active tab changes
  useEffect(() => {
    if (mainRef.current && activeTab) {
      mainRef.current.scrollTop = activeTab.scrollTop;
    }
  }, [activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpdated = useEffectEvent((data: FileData) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.path === data.path);
      if (index === -1) {
        return prev;
      }
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        content: data.content,
        mtimeMs: data.mtimeMs,
        lastModifiedAt: Temporal.Instant.fromEpochMilliseconds(Math.floor(data.mtimeMs)),
        hasUnseenChanges: index !== activeIndex,
      };
      return updated;
    });
  });

  // IPC listeners
  useEffect(() => {
    mdview.onFileUpdated(handleFileUpdated);

    mdview.onFilesFromArgs((files: FileData[]) => {
      files.forEach((f) => openFile(f));
    });

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
    });
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
            maxWidth={
              contentWidth.mode === "full"
                ? undefined
                : contentWidth.mode === "fixed"
                  ? contentWidth.fixedWidth
                  : contentWidth.cappedWidth
            }
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
