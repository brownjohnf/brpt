import type { FileData, Tab } from "./types";

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
  | { type: "REORDER_TAB"; fromIndex: number; toIndex: number };

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
        tabs[existing] = { ...tabs[existing], content: data.content, removed: false };
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
      };
      const tabs = [...state.tabs, newTab];
      return { tabs, activeIndex: tabs.length - 1 };
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
      tabs[index] = {
        ...tabs[index],
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
  }
}
