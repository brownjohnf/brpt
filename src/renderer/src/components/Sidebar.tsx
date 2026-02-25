import { useCallback, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { ProjectEntry } from "../../../shared/types";
import { classNames } from "../classNames";
import { groupTabs } from "../groupTabs";
import type { Tab } from "../types";
import { TabItem } from "./TabItem";

const GROUP_MIME = "application/x-brpt-tab-group";

interface SidebarProps {
  tabs: Tab[];
  activeIndex: number;
  projects: ProjectEntry[];
  containerFolders: string[];
  groupOrder: string[];
  width: number;
  onActivateTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onOpenDialog: () => void;
  onToggleTheme: () => void;
  onDrop: (e: React.DragEvent) => void;
  onResize: (width: number) => void;
  onReorderTab: (fromIndex: number, toIndex: number) => void;
  onReorderGroup: (fromName: string, toName: string) => void;
}

const MIN_WIDTH = 120;
const MAX_WIDTH = 400;

type GroupDropPosition = "above" | "below" | null;

function GroupContainer({
  name,
  isCollapsed,
  onToggle,
  onReorderGroup,
  children,
}: {
  name: string;
  isCollapsed: boolean;
  onToggle: () => void;
  onReorderGroup: (fromName: string, toName: string) => void;
  children: ReactNode;
}): ReactNode {
  const [dropPosition, setDropPosition] = useState<GroupDropPosition>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(GROUP_MIME, name);
      e.dataTransfer.effectAllowed = "move";
    },
    [name],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(GROUP_MIME)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        setDropPosition(e.clientY < midY ? "above" : "below");
      }
    },
    [],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setDropPosition(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      setDropPosition(null);
      const fromName = e.dataTransfer.getData(GROUP_MIME);
      if (!fromName || fromName === name) {
        return;
      }
      onReorderGroup(fromName, name);
    },
    [name, onReorderGroup],
  );

  const handleDragEnd = useCallback(() => {
    setDropPosition(null);
  }, []);

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      style={{
        borderTop: `2px solid ${dropPosition === "above" ? "var(--tab-changed-dot)" : "transparent"}`,
        borderBottom: `2px solid ${dropPosition === "below" ? "var(--tab-changed-dot)" : "transparent"}`,
      }}
    >
      <button
        type="button"
        draggable
        onClick={onToggle}
        onDragStart={handleDragStart}
        className={classNames(
          "w-full flex items-baseline gap-1 text-left",
          "px-2 py-1 mt-1 mb-0.5 text-[11px] font-semibold tracking-wide",
          "text-[var(--tab-text)] opacity-60",
          "bg-transparent border-none cursor-pointer",
          "hover:opacity-100"
        )}
      >
        <span
          className="text-[9px] inline-block transition-transform"
          style={{
            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
        {name}
      </button>
      {children}
    </div>
  );
}

export function Sidebar({
  tabs,
  activeIndex,
  projects,
  containerFolders,
  groupOrder,
  width,
  onActivateTab,
  onCloseTab,
  onOpenDialog,
  onToggleTheme,
  onDrop,
  onResize,
  onReorderTab,
  onReorderGroup,
}: SidebarProps): ReactNode {
  const [dragOver, setDragOver] = useState(false);
  const dragging = useRef(false);

  const { grouped, ungrouped } = useMemo(
    () => groupTabs(tabs, projects, containerFolders, groupOrder),
    [tabs, projects, containerFolders, groupOrder]
  );

  const [collapsed, toggleCollapsed] = useReducer(
    (state: Record<string, boolean>, name: string) => ({
      ...state,
      [name]: !state[name],
    }),
    {} as Record<string, boolean>
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes("application/x-brpt-tab") ||
      e.dataTransfer.types.includes(GROUP_MIME)
    ) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setDragOver(false);
      onDrop(e);
    },
    [onDrop]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startWidth = width;

      function onMouseMove(e: MouseEvent): void {
        if (!dragging.current) {
          return;
        }
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + (e.clientX - startX))
        );
        onResize(newWidth);
      }

      function onMouseUp(): void {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, onResize]
  );

  return (
    <div className="flex" style={{ width }}>
      <div
        className={classNames(
          "flex-1 flex flex-col overflow-hidden",
          "bg-[var(--sidebar-bg)]",
          dragOver && "bg-[var(--tab-hover-bg)]"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex-1 overflow-y-auto p-2">
          {grouped.map((group) => (
            <GroupContainer
              key={group.name}
              name={group.name}
              isCollapsed={!!collapsed[group.name]}
              onToggle={() => toggleCollapsed(group.name)}
              onReorderGroup={onReorderGroup}
            >
              {!collapsed[group.name] &&
                group.tabs.map(({ tab, index }) => (
                  <TabItem
                    key={tab.path}
                    tab={tab}
                    index={index}
                    isActive={index === activeIndex}
                    groupRootPath={group.rootPath}
                    onClick={() => onActivateTab(index)}
                    onClose={() => onCloseTab(index)}
                    onReorderTab={onReorderTab}
                  />
                ))}
            </GroupContainer>
          ))}
          {ungrouped.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => toggleCollapsed("__ungrouped__")}
                className={classNames(
                  "w-full flex items-baseline gap-1 text-left",
                  "px-2 py-1 mt-1 mb-0.5 text-[11px] font-semibold tracking-wide",
                  "text-[var(--tab-text)] opacity-60",
                  "bg-transparent border-none cursor-pointer",
                  "hover:opacity-100"
                )}
              >
                <span
                  className="text-[9px] inline-block transition-transform"
                  style={{
                    transform: collapsed["__ungrouped__"]
                      ? "rotate(-90deg)"
                      : "rotate(0deg)",
                  }}
                >
                  ▼
                </span>
                ungrouped
              </button>
              {!collapsed["__ungrouped__"] &&
                ungrouped.map(({ tab, index }) => (
                  <TabItem
                    key={tab.path}
                    tab={tab}
                    index={index}
                    isActive={index === activeIndex}
                    onClick={() => onActivateTab(index)}
                    onClose={() => onCloseTab(index)}
                    onReorderTab={onReorderTab}
                  />
                ))}
            </div>
          )}
        </div>
        <div className="p-2 border-t border-[var(--sidebar-border)] flex justify-between">
          <button
            onClick={onOpenDialog}
            title="Open file"
            className={classNames(
              "bg-[var(--btn-bg)] border-none text-[var(--btn-text)] cursor-pointer",
              "text-lg w-8 h-8 rounded-md flex items-center justify-center",
              "hover:bg-[var(--btn-hover-bg)]"
            )}
          >
            +
          </button>
          <button
            onClick={onToggleTheme}
            title="Toggle theme"
            className={classNames(
              "bg-[var(--btn-bg)] border-none text-[var(--btn-text)] cursor-pointer",
              "text-lg w-8 h-8 rounded-md flex items-center justify-center",
              "hover:bg-[var(--btn-hover-bg)]"
            )}
          >
            &#9680;
          </button>
        </div>
      </div>
      <div
        className={classNames(
          "w-1 cursor-col-resize shrink-0 bg-[var(--sidebar-bg)]",
          "border-x border-[var(--sidebar-border)]",
          "hover:bg-[var(--tab-hover-bg)]",
          "active:bg-[var(--tab-hover-bg)]"
        )}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}
