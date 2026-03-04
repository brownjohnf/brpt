# Changelog

## Unreleased (`c1a574b..df62071`)

### New features

- **Find-in-document** — `Ctrl+F` search using the CSS Custom
  Highlight API, with a new `FindBar` component and
  `useDocumentSearch` hook
- **Command palette** — with container folders sorted by
  specificity
- **MRU QuickGoto** — redesigned with Alfred-style number hotkeys
  for fast tab switching
- **Raw HTML blocks** — supported in markdown rendering;
  `--help-all` documents the blank-line limitation
- **Active tab label** — pinned at the top of the sidebar
- **Alt+number tab switching** — `Alt+1`–`9` works alongside
  `Ctrl/Cmd+1`–`9` for jumping to tabs by position

### Annotation system redesign

- Unified sidecar-based annotation storage with dismiss
  support — major rewrite of the main process annotation
  handling and shared types
- Sidebar shows update dots when new annotations arrive
- Added `ANNOTATIONS.md` documenting the feature, file format,
  and use cases

### UI polish

- Bell shake and top bar breathing animation on unread
  notifications
- Unread notification glow moved from status bar to top bar
- Deleted-file banner moved to app chrome between top bar and
  content area
- Sidebar scroll shadows
- Gutter performance improvements: throttled `ResizeObserver`
  to one measure per frame, cached element refs to avoid
  redundant DOM queries on resize

### Infrastructure

- Tab state moved from config to `store.json`; added
  quick-prune-tabs (default `pruneKeepCount` set to 5)
- Launcher (`resources/brpt`) rewritten — uses `open`/`Popen`
  for first launch, passes `--cwd` for path resolution
- Fixed duplicate `linux` key in `electron-builder.yml` (merged
  category from contributor PR #1)
- macOS: use `app.focus({ steal: true })` for reliable window
  foregrounding
