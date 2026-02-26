# Brett's Rad Preview Tool

A live-updating preview tool for markdown files, diffs, and annotated documents. Built with Electron. Files are watched on disk and the preview auto-refreshes when they change — making it useful as a render target for other tools.

<!-- screenshot -->

## Features

- Live-reload on file changes (via chokidar file watching)
- Markdown rendering with syntax-highlighted code blocks (marked + highlight.js)
- Diff viewing from unified diff files or two-file comparison (diff2html)
- Annotations — JSON-driven line-level notes that interleave with document content
- Notifications — programmatic markdown messages associated with open files
- Tabbed interface with drag-and-drop reordering and project-based tab grouping
- Collapsible sidebar and resizable notification drawer
- Light and dark themes
- Single-instance — new invocations forward arguments to the running window
- Session persistence — open tabs are restored on launch

## Install

The app is unsigned (no Apple Developer certificate on macOS).

Build from source:

```bash
git clone <repo-url>
cd brett-rad-preview-tool
npm install
```

### macOS

```bash
npm run build:mac
npm run install:mac
```

This copies the `.app` to `~/Applications/` and symlinks the `brpt` CLI to `/usr/local/bin/brpt`.

To uninstall:

```bash
npm run uninstall:mac
```

### Linux

```bash
npm run build:linux
npm run install:linux
```

This builds an AppImage and installs the `brpt` CLI to `~/.local/bin/`. Make sure `~/.local/bin` is on your `PATH`.

To uninstall:

```bash
npm run uninstall:linux
```

## Usage

### Open files

```bash
brpt README.md
brpt file1.md file2.md file3.md
```

Each file opens as a tab. Any text file works, though markdown files get full rendering.

### Diff from a unified diff file

```bash
brpt --diff document.md changes.patch
```

The first argument is the current file, the second is a unified diff (output of `diff -u` or `git diff`). Both files are watched.

### Diff from two files

```bash
brpt --diff-by-files document.md document.old.md
```

Computes the diff internally by comparing the two files.

### Annotations

```bash
brpt document.md --annotate annotations.json
```

Annotations attach contextual notes to specific lines. The annotation file is watched, so annotations update live. Works with all modes (plain files, `--diff`, `--diff-by-files`).

Annotation file format:

```json
{
  "annotations": [
    {
      "line": 5,
      "format": "markdown",
      "content": "This line has a bug."
    },
    {
      "startLine": 10,
      "endLine": 15,
      "format": "markdown",
      "content": "This section needs review."
    }
  ]
}
```

### Notifications

```bash
brpt --notify README.md "Check the **formatting** on line 12."
brpt --foreground --notify README.md "Build failed — see errors."
```

Sends a markdown notification associated with the target file. The notification appears in the app's notification drawer. By default, `--notify` sends without bringing the app to the foreground; add `--foreground` to also raise the window.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+O` | Open file dialog |
| `Cmd+W` | Close active tab |
| `Cmd+T` | Quick goto (fuzzy tab search) |
| `Cmd+Shift+T` | Reopen last closed tab |
| `Cmd+1` – `Cmd+8` | Switch to nth tab |
| `Cmd+9` | Switch to last tab |
| `Cmd+Shift+[` | Previous tab |
| `Cmd+Shift+]` | Next tab |

## Using with AI Coding Tools

brpt is designed as a render target for other tools. Write a markdown file, point brpt at it, and see live updates as the file changes. Annotations and notifications are particularly useful for AI-driven workflows — a code review agent can generate an annotations JSON and have the results appear inline in the document.

This project's `CLAUDE.md` includes the full `brpt --help` output, so Claude Code can use brpt natively when working in this repo. To enable brpt in other projects, paste the `brpt --help` output into that project's `CLAUDE.md` with a note like "Use `brpt` to preview markdown files."

## Configuration

Configuration is stored at `~/.brpt/brpt-config.json` (override with `BRPT_CONFIG` env var). The file is created automatically on first launch.

- `theme` — `"light"` or `"dark"`, toggleable in the app
- `openFiles` — session restore; tracks which files were open when the app last closed
- `containerFolders` — paths used to group tabs in the sidebar by project (supports `~` expansion)
- `projects` — array of `{ path, alias }` entries for named project labels in the sidebar
- `contentWidth` — `{ mode, fixedWidth, cappedWidth }` for controlling content area max-width. Mode is `"fixed"`, `"capped"`, or `"full"`.
- `sidebarWidth` — sidebar width in pixels
- `brpt_development_roots` — list of project directory paths. When `brpt` is run, it checks if an `electron-vite dev` instance is running from any of these roots and forwards files to it instead of the packaged app.

Note: environment variables set in shell profiles (`.zshrc`, etc.) are only available when launching via the `brpt` CLI. macOS GUI launches (Finder, Dock) do not inherit shell environment variables.

## Development

```bash
npm run dev                        # Dev mode with HMR
npm run dev -- -- path/to/file.md  # Dev mode, open a file
python3 resources/brpt file.md     # CLI in dev mode (forwards to running dev instance)
```

See `CLAUDE.md` for architecture details.

## License

[MIT](LICENSE)
