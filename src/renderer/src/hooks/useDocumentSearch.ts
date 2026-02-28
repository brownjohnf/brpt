import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type ResolveLineNumber = (node: Node) => number | null;

export interface DocumentSearchState {
  query: string;
  matchCount: number;
  activeIndex: number;
  matchLineNumbers: Set<number>;
}

const EMPTY_STATE: DocumentSearchState = {
  query: "",
  matchCount: 0,
  activeIndex: 0,
  matchLineNumbers: new Set(),
};

interface MatchInfo {
  sourceLine: number | null;
}

/** Walk text nodes and collect match metadata (no Range objects). */
function findMatchInfo(contentEl: HTMLElement, query: string, resolveLineNumber: ResolveLineNumber | null): MatchInfo[] {
  const lower = query.toLowerCase();
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  const matches: MatchInfo[] = [];

  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const textLower = (node.textContent ?? "").toLowerCase();
    let offset = 0;
    while (true) {
      const idx = textLower.indexOf(lower, offset);
      if (idx === -1) { break; }
      const sourceLine = resolveLineNumber ? resolveLineNumber(node) : null;
      matches.push({ sourceLine });
      offset = idx + 1;
    }
  }

  return matches;
}

/** Walk text nodes and create live Range objects for CSS Custom Highlight API. */
function createHighlightRanges(contentEl: HTMLElement, query: string): Range[] {
  const lower = query.toLowerCase();
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];

  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const textLower = (node.textContent ?? "").toLowerCase();
    let offset = 0;
    while (true) {
      const idx = textLower.indexOf(lower, offset);
      if (idx === -1) { break; }
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + lower.length);
      ranges.push(range);
      offset = idx + 1;
    }
  }

  return ranges;
}

function applyHighlights(ranges: Range[], activeIndex: number): void {
  if (!CSS.highlights) { return; }

  if (ranges.length === 0) {
    CSS.highlights.delete("search-results");
    CSS.highlights.delete("search-active");
    return;
  }

  CSS.highlights.set("search-results", new Highlight(...ranges));

  const activeRange = ranges[activeIndex];
  if (activeRange) {
    CSS.highlights.set("search-active", new Highlight(activeRange));
  } else {
    CSS.highlights.delete("search-active");
  }
}

function clearHighlights(): void {
  if (!CSS.highlights) { return; }
  CSS.highlights.delete("search-results");
  CSS.highlights.delete("search-active");
}

function buildMatchLineNumbers(matches: MatchInfo[]): Set<number> {
  const set = new Set<number>();
  for (const m of matches) {
    if (m.sourceLine != null) {
      set.add(m.sourceLine);
    }
  }
  return set;
}

export function useDocumentSearch(
  contentEl: HTMLDivElement | null,
  resolveLineNumber: ResolveLineNumber | null,
): {
  state: DocumentSearchState;
  search: (query: string) => void;
  next: () => void;
  prev: () => void;
  clear: () => void;
} {
  const [state, setState] = useState<DocumentSearchState>(EMPTY_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Track whether we need to scroll to the active match after the next highlight pass.
  // Set to true by search/next/prev, consumed by the layout effect.
  const scrollToActive = useRef(false);

  // After React commits DOM changes, walk the DOM and apply highlights.
  // This runs before paint, so the browser sees the highlights on the first frame.
  // We create Range objects here (not in search/next/prev) because React's re-render
  // replaces DOM nodes, which would orphan any ranges created before the commit.
  useLayoutEffect(() => {
    if (!state.query || !contentEl || state.matchCount === 0) {
      clearHighlights();
      return;
    }

    const ranges = createHighlightRanges(contentEl, state.query);
    applyHighlights(ranges, state.activeIndex);

    if (scrollToActive.current) {
      scrollToActive.current = false;
      const activeRange = ranges[state.activeIndex];
      if (activeRange) {
        activeRange.startContainer.parentElement?.scrollIntoView({ block: "nearest" });
      }
    }
  }, [state.query, state.activeIndex, state.matchCount, contentEl]);

  const search = useCallback((query: string) => {
    clearHighlights();
    if (!query || !contentEl) {
      setState(EMPTY_STATE);
      return;
    }
    const matches = findMatchInfo(contentEl, query, resolveLineNumber);
    const matchLineNumbers = buildMatchLineNumbers(matches);
    scrollToActive.current = true;
    setState({ query, matchCount: matches.length, activeIndex: 0, matchLineNumbers });
  }, [contentEl, resolveLineNumber]);

  const next = useCallback(() => {
    const { matchCount, activeIndex } = stateRef.current;
    if (matchCount === 0) { return; }
    scrollToActive.current = true;
    const nextIndex = (activeIndex + 1) % matchCount;
    setState((prev) => ({ ...prev, activeIndex: nextIndex }));
  }, []);

  const prev = useCallback(() => {
    const { matchCount, activeIndex } = stateRef.current;
    if (matchCount === 0) { return; }
    scrollToActive.current = true;
    const prevIndex = (activeIndex - 1 + matchCount) % matchCount;
    setState((prev) => ({ ...prev, activeIndex: prevIndex }));
  }, []);

  const clear = useCallback(() => {
    clearHighlights();
    setState(EMPTY_STATE);
  }, []);

  return { state, search, next, prev, clear };
}
