import type { Annotation, BrptNotification, DiffData, DiffTab, FileData, MarkdownTab, Tab } from "./types";

export interface TabsState {
  tabs: Tab[];
  activeIndex: number;
}

export type TabsAction =
  | { type: "OPEN_FILE"; data: FileData }
  | { type: "CLOSE_TAB"; index: number }
  | { type: "ACTIVATE_TAB"; index: number; currentScrollTop: number }
  | { type: "FILE_UPDATED"; data: FileData }
  | { type: "FILE_REMOVED"; path: string }
  | { type: "REORDER_TAB"; fromIndex: number; toIndex: number }
  | { type: "OPEN_DIFF"; data: DiffData }
  | { type: "DIFF_UPDATED"; data: DiffData }
  | { type: "SET_ANNOTATIONS"; targetPath: string; annotations: Annotation[] }
  | { type: "ACTIVATE_FILE_BY_PATH"; path: string }
  | { type: "SET_NOTIFICATIONS"; path: string; notifications: BrptNotification[] }
  | { type: "ADD_NOTIFICATION"; path: string; notification: BrptNotification }
  | { type: "MARK_NOTIFICATIONS_READ"; path: string };

export const initialTabsState: TabsState = {
  tabs: [],
  activeIndex: -1,
};

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "OPEN_FILE": {
      const { data } = action;
      const existing = state.tabs.findIndex((t) => t.path === data.path);
      if (existing !== -1) {
        const tabs = [...state.tabs];
        const tab = tabs[existing] as MarkdownTab;
        tabs[existing] = { ...tab, content: data.content, removed: false };
        return { tabs, activeIndex: existing };
      }
      const newTab: Tab = {
        kind: "markdown",
        path: data.path,
        content: data.content,
        mtimeMs: data.mtimeMs,
        scrollTop: 0,
        lastModifiedAt: Temporal.Instant.fromEpochMilliseconds(
          Math.floor(data.mtimeMs),
        ),
        hasUnseenChanges: false,
        notifications: [],
        unreadNotificationCount: 0,
      };
      const tabs = [...state.tabs, newTab];
      return { tabs, activeIndex: tabs.length - 1 };
    }

    case "OPEN_DIFF": {
      const { data } = action;
      const existing = state.tabs.findIndex((t) => t.path === data.newPath);
      if (existing !== -1) {
        const tabs = [...state.tabs];
        const tab = tabs[existing] as DiffTab;
        tabs[existing] = {
          ...tab,
          diff: data.diff,
          newContent: data.newContent,
          oldContent: data.oldContent,
          removed: false,
        };
        return { tabs, activeIndex: existing };
      }
      const newTab: DiffTab = {
        kind: "diff",
        mode: data.mode,
        secondPath: data.secondPath,
        path: data.newPath,
        newContent: data.newContent,
        oldContent: data.oldContent,
        diff: data.diff,
        scrollTop: 0,
        lastModifiedAt: Temporal.Instant.fromEpochMilliseconds(Math.floor(data.mtimeMs)),
        hasUnseenChanges: false,
        notifications: [],
        unreadNotificationCount: 0,
      };
      const tabs = [...state.tabs, newTab];
      return { tabs, activeIndex: tabs.length - 1 };
    }

    case "DIFF_UPDATED": {
      const { data } = action;
      const index = state.tabs.findIndex((t) => t.path === data.newPath);
      if (index === -1) {
        return state;
      }
      const tabs = [...state.tabs];
      const tab = tabs[index] as DiffTab;
      tabs[index] = {
        ...tab,
        diff: data.diff,
        newContent: data.newContent,
        oldContent: data.oldContent,
        lastModifiedAt: Temporal.Instant.fromEpochMilliseconds(Math.floor(data.mtimeMs)),
        hasUnseenChanges: index !== state.activeIndex,
      };
      return { tabs, activeIndex: state.activeIndex };
    }

    case "CLOSE_TAB": {
      const { index } = action;
      if (index < 0 || index >= state.tabs.length) {
        return state;
      }
      const tabs = state.tabs.filter((_, i) => i !== index);
      let activeIndex: number;
      if (tabs.length === 0) {
        activeIndex = -1;
      } else if (state.activeIndex >= tabs.length) {
        activeIndex = tabs.length - 1;
      } else if (index <= state.activeIndex) {
        activeIndex = Math.max(0, state.activeIndex - 1);
      } else {
        activeIndex = state.activeIndex;
      }
      return { tabs, activeIndex };
    }

    case "ACTIVATE_TAB": {
      const { index, currentScrollTop } = action;
      if (index < 0 || index >= state.tabs.length) {
        return state;
      }
      const tabs = [...state.tabs];
      if (state.activeIndex >= 0 && tabs[state.activeIndex]) {
        tabs[state.activeIndex] = {
          ...tabs[state.activeIndex],
          scrollTop: currentScrollTop,
        };
      }
      if (tabs[index].hasUnseenChanges) {
        tabs[index] = { ...tabs[index], hasUnseenChanges: false };
      }
      return { tabs, activeIndex: index };
    }

    case "FILE_UPDATED": {
      const { data } = action;
      const index = state.tabs.findIndex((t) => t.path === data.path);
      if (index === -1) {
        return state;
      }
      const tabs = [...state.tabs];
      const tab = tabs[index] as MarkdownTab;
      tabs[index] = {
        ...tab,
        content: data.content,
        mtimeMs: data.mtimeMs,
        lastModifiedAt: Temporal.Instant.fromEpochMilliseconds(
          Math.floor(data.mtimeMs),
        ),
        hasUnseenChanges: index !== state.activeIndex,
      };
      return { tabs, activeIndex: state.activeIndex };
    }

    case "FILE_REMOVED": {
      const index = state.tabs.findIndex((t) => t.path === action.path);
      if (index === -1) {
        return state;
      }
      const tabs = [...state.tabs];
      tabs[index] = { ...tabs[index], removed: true };
      return { tabs, activeIndex: state.activeIndex };
    }

    case "REORDER_TAB": {
      const { fromIndex, toIndex } = action;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 || fromIndex >= state.tabs.length ||
        toIndex < 0 || toIndex >= state.tabs.length
      ) {
        return state;
      }
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);

      let activeIndex = state.activeIndex;
      if (state.activeIndex === fromIndex) {
        activeIndex = toIndex;
      } else if (fromIndex < state.activeIndex && toIndex >= state.activeIndex) {
        activeIndex = state.activeIndex - 1;
      } else if (fromIndex > state.activeIndex && toIndex <= state.activeIndex) {
        activeIndex = state.activeIndex + 1;
      }
      return { tabs, activeIndex };
    }

    case "SET_ANNOTATIONS": {
      const index = state.tabs.findIndex((t) => t.path === action.targetPath);
      if (index === -1) {
        return state;
      }
      const tabs = [...state.tabs];
      tabs[index] = {
        ...tabs[index],
        annotations: action.annotations,
      };
      return { tabs, activeIndex: state.activeIndex };
    }

    case "ACTIVATE_FILE_BY_PATH": {
      const index = state.tabs.findIndex((t) => t.path === action.path);
      if (index === -1 || index === state.activeIndex) {
        return state;
      }
      return { tabs: state.tabs, activeIndex: index };
    }

    case "SET_NOTIFICATIONS": {
      const index = state.tabs.findIndex((t) => t.path === action.path);
      if (index === -1) {
        return state;
      }
      const tabs = [...state.tabs];
      const unreadCount = action.notifications.filter((n) => !n.read).length;
      tabs[index] = {
        ...tabs[index],
        notifications: action.notifications,
        unreadNotificationCount: unreadCount,
      };
      return { tabs, activeIndex: state.activeIndex };
    }

    case "ADD_NOTIFICATION": {
      const index = state.tabs.findIndex((t) => t.path === action.path);
      if (index === -1) {
        return state;
      }
      const tabs = [...state.tabs];
      const tab = tabs[index];
      tabs[index] = {
        ...tab,
        notifications: [...tab.notifications, action.notification],
        unreadNotificationCount: tab.unreadNotificationCount + 1,
      };
      return { tabs, activeIndex: state.activeIndex };
    }

    case "MARK_NOTIFICATIONS_READ": {
      const index = state.tabs.findIndex((t) => t.path === action.path);
      if (index === -1) {
        return state;
      }
      const tabs = [...state.tabs];
      const tab = tabs[index];
      tabs[index] = {
        ...tab,
        notifications: tab.notifications.map((n) => ({ ...n, read: true })),
        unreadNotificationCount: 0,
      };
      return { tabs, activeIndex: state.activeIndex };
    }
  }
}
