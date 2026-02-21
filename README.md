# Brett's Rad Preview Tool

A live-updating preview tool for developers. Files are watched and auto-refreshed — open a file, and the preview stays current as the file changes on disk. Strictly a viewer — no editing.

## Supported Formats

- **Markdown** — full rendering with syntax-highlighted code blocks

### Planned

- **Diffs** — rendered diff viewing
- **Images** — image preview

## Install

```bash
npm install
npm run build:mac:install
```

This builds the `.app`, copies it to `~/Applications/`, and symlinks the `brpt` CLI to `/usr/local/bin/` (requires sudo on first install).

To uninstall:

```bash
npm run uninstall:mac
```

## CLI Usage

```bash
brpt file.md                   # Open a file in the running app (or launch it)
brpt README.md CHANGELOG.md    # Open multiple files
brpt                           # Launch the app with no files
```

When the app is already running, `brpt` opens files in the existing window.

## Configuration

Settings are stored in `~/.brpt/brpt-config.json`. The file is created automatically on first launch.

```json
{
  "theme": "light",
  "openFiles": [],
  "containerFolders": ["~/Projects/Minca"],
  "contentWidth": {
    "mode": "fixed",
    "fixedWidth": "880px",
    "cappedWidth": "1200px"
  },
  "brpt_development_roots": ["~/Projects/Minca/brett-rad-preview-tool"]
}
```

- **theme** — `"light"` or `"dark"`, toggleable in the app
- **openFiles** — session restore; tracks which files were open when the app last closed
- **containerFolders** — paths used to group tabs in the sidebar by project. Supports `~` expansion.
- **contentWidth** — controls the content area max-width. Mode is `"fixed"`, `"capped"`, or `"full"`, with customizable width values.
- **brpt_development_roots** — list of project directory paths. When `brpt` is run, it checks if an `electron-vite dev` instance is running from any of these roots and forwards files to it instead of the packaged app.

The config path can be overridden with the `BRPT_CONFIG` environment variable. Note: environment variables set in shell profiles (`.zshrc`, etc.) are only available when launching via the `brpt` CLI. macOS GUI launches (Finder, Dock) do not inherit shell environment variables.

## Development

```bash
npm run dev                        # Dev mode with HMR
npm run dev -- -- path/to/file.md  # Dev mode, open a file
```

## Building

```bash
npm run build          # Build to out/
npm run build:mac      # Build + package .app
```

The app is unsigned (no Apple Developer cert). Uses `electron-builder` with config in `electron-builder.yml`.

## Tech Stack

- Electron + electron-vite
- React 19 + TypeScript + Tailwind CSS v4
- Markdown rendering via marked + highlight.js (in preload script)
- File watching via chokidar
