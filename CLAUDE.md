# Brett's Rad Preview Tool

Live-updating markdown preview tool built with Electron. Strictly a viewer — no editing. All open files are watched and auto-refreshed.

## Architecture

```
brett-rad-preview-tool/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json              # Solution-style (references node + web)
├── tsconfig.node.json         # Main + preload + shared (Node target)
├── tsconfig.web.json          # Renderer + shared (browser target)
├── resources/
│   └── brpt                   # CLI script (bundled into .app, symlinked to /usr/local/bin)
├── src/
│   ├── shared/
│   │   ├── types.ts           # Canonical types (AppConfig, FileData, ContentWidthConfig)
│   │   └── date-ban.d.ts      # @deprecated overlays on Date (use Temporal instead)
│   ├── main/
│   │   └── index.ts           # Electron main process (window, file watching, IPC)
│   ├── preload/
│   │   ├── index.ts           # Context bridge (markdown rendering via marked + highlight.js)
│   │   └── index.d.ts         # Type declarations for renderer access
│   └── renderer/
│       ├── index.html         # Vite entry HTML
│       └── src/
│           ├── main.tsx       # React entry point (Temporal polyfill)
│           ├── App.tsx        # Root component (useReducer, IPC, keyboard shortcuts)
│           ├── App.css        # Tailwind + theme CSS variables
│           ├── env.d.ts       # Global type declarations (Temporal)
│           ├── types.ts       # Re-exports shared types + renderer-only Tab interface
│           ├── tabsReducer.ts # useReducer for tabs + activeIndex
│           ├── groupTabs.ts   # Groups tabs by containerFolders
│           ├── classNames.ts  # Utility for conditional class strings
│           ├── platform.ts    # Platform detection helpers
│           ├── useThemeStyles.ts  # Theme stylesheet toggling hook
│           └── components/
│               ├── Sidebar.tsx
│               ├── TabItem.tsx
│               ├── ContentArea.tsx
│               ├── TopBar.tsx         # Content width mode/value controls
│               ├── StatusBar.tsx
│               └── ui-elements/
│                   └── SegmentedControl.tsx
├── out/                       # Build output (gitignored)
├── icon.icns                  # macOS app icon
└── icon.iconset/              # Source PNGs for the icon
```

Built with electron-vite (Vite for all three targets: main, preload, renderer). React + TypeScript + Tailwind v4 for the renderer. Markdown rendering happens in the preload script (which has Node access via `sandbox: false`).

## Running

```bash
npm run dev                        # Dev mode with HMR
npm run dev -- -- path/to/file.md  # Dev mode, open a file
```

## Building

```bash
npm run build      # Build to out/
npm run build:mac  # Build + package .app
```

Uses `electron-builder` (config in `electron-builder.yml`). The app is unsigned (no Apple Developer cert).

## Core Invariants

- Every open file gets a tab. Every tab gets persisted. No change should break tab persistence, regardless of file type or viewer kind.
- **The config is persistent state, not a session.** `openFiles` is the user's workspace. It is always restored on launch — CLI args open _on top of_ the existing config, never replacing it. The config is never wiped unless the user explicitly does so.

## Key Design Decisions

- **Single instance**: Uses `app.requestSingleInstanceLock()`. Second launches forward their CLI args to the first instance.
- **File watching**: chokidar in the main process, sends updates via IPC.
- **Markdown rendering in preload**: The renderer has `contextIsolation: true` and no Node access. Rendering (marked + highlight.js) lives in the preload script which exposes `mdview.renderMarkdown()` to the renderer.
- **Theme**: Two themes (light/dark) via `data-theme` attribute on `<body>`. Theme stylesheets (github-markdown-css, highlight.js) are imported as raw CSS and toggled via `<style disabled>` elements in the `useThemeStyles` hook.
- **Session restore**: Open tabs are persisted to `openFiles` in `~/.brpt/brpt-config.json` and restored on next launch. Entries are either plain strings (viewer auto-detected from file extension) or objects describing the viewer and its inputs (e.g., `{ type: "diff-by-files", file, oldFile }`). Config path can be overridden with `BRPT_CONFIG` env var.
- **Temporal polyfill**: `@js-temporal/polyfill` is loaded as a true polyfill in `main.tsx` and assigned to `globalThis`. Global types are declared in `env.d.ts`. Use `Temporal` directly anywhere in the renderer — do not import the polyfill per-file. Do not use `Date`.
- **Tab state**: `useReducer` in `App.tsx` manages tabs + activeIndex atomically via `tabsReducer.ts`. Actions: `OPEN_FILE`, `CLOSE_TAB`, `ACTIVATE_TAB`, `FILE_UPDATED`.
- **Tab grouping**: `containerFolders` in config define project roots. Tabs whose paths fall under a root are grouped in the sidebar. Others appear under "Ungrouped".
- **brpt CLI**: Shell script in `resources/brpt`, symlinked to `/usr/local/bin/brpt` on install. Supports dev-mode forwarding — reads `brpt_development_roots` from config, detects running `electron-vite dev` instances via `pgrep`, and forwards files using `open -a` with the dev Electron.app. Falls back to the packaged app when no dev instance is running.
- **Viewer features must be pluggable.** Every feature (gutter line measurement, annotations, top bar controls, etc.) may work differently between viewer types (markdown, diff, future types). Never hardcode a feature's logic to a specific renderer. Shared UI components (like the gutter) should accept data/callbacks from the viewer, not query the DOM themselves. Each viewer provides its own implementation of how a feature works.

## Expected Behaviors

- **Answer questions directly.** When the user asks a question, respond with a clear answer. Do not continue taking actions or making tool calls. Stop, answer the question, and wait for direction.
- **Do not thrash.** If a tool call is rejected or an approach isn't working, stop and explain the situation. Do not immediately retry a different variation of the same thing. Ask the user how to proceed.
- **Questions first, actions second.** When the user asks a question, answer it. Do not start taking actions or making edits unless explicitly asked. Wait for confirmation or further instruction before proceeding.
- **Do exactly what was asked — no more.** Do not silently expand scope. If a change seems like a natural follow-on, _ask_ before doing it.
- **Business logic deference.** Do not assume or assert what the business logic should be. If a proposed change affects business behavior, ask the user whether that's the desired behavior rather than stating what it should be.

## Communication Style

Maintain a professional tone at all times. Avoid slang, shorthand, and casual phrases such as "yeah", "got it", "yep", etc.

Never say "Honestly" - you're always honest to the best of your ability.

**When the user points out a potential problem:** Do not immediately agree ("You're right", "Good catch", etc.). Investigate the issue first, then state what you found. Don't be a sycophant - validate claims before affirming them.

**Never call something "error-prone."** Always say _what_ the error is, _why_ it happens, and _how_ it manifests.

## Exploration Guidelines

- Never read files in `node_modules/` when exploring the codebase. Only read a specific module's source if you need to understand that module's API or behavior.

## Code Guidelines

- **No dedicated type files by default.** Modern TypeScript has `import type`, so there is generally no need to segregate types into separate files. Types, interfaces, and the functions that operate on them belong together in the same module. Code can be split across files for organizational purposes, and occasionally a type file makes sense, but the default should be co-location.
- **Build in dependency order.** When adding new code, define the function/constant first, then add the import, then add the call site. Never leave the build broken mid-edit.
- Always use curly braces for `if` statements, even single-line ones.
- Avoid ternary expressions inside string templates.
- Never use the phrase "code smell" - describe the issue directly.
- Do not ever leave a comment that says "Defensive:" - just say the thing that needs to be said.
- Don't use banner-style section comments like `// -------- Section --------`. If a section comment is truly needed, use `/** Section */`. Ideally, organize code so structure is self-evident.
- Never use pound signs to abbreviate "Number".
- If asked for a VS Code link, use the format: `code -g "path/to/file.tsx:42"`

## Git Guidelines

- When generating commits, do not add Anthropic or Claude as an author or co-author.
- Do not mention claude or anthropic in commit messages at all (unless the commit is _about_ claude).
- Favor `git add --all` unless there's a specific reason not to.
- Never use a bare `git push`. Always specify the remote and branch explicitly.
- Never use `git checkout -- <file>` to undo recent edits. Use the Edit tool instead.

## Planning

- Never use `EnterPlanMode` or `ExitPlanMode`. Use `/bplan` instead.
- Plan files go in `.claude/plans/` (relative to project root).
- When the user says "proceed" or "do it" after reviewing a plan, read the plan file and implement it. Do not re-explore or re-plan.

## Shorthand Commands

- **`oa`** ("open again"): Re-open the last file that was opened in VS Code. Useful when the editor didn't focus properly.
- **`fpwl`**: Force push with lease (`git push --force-with-lease`).
- **`reprompt`**: Reload all prompts (CLAUDE.md, CLAUDE.local.md, etc.).

## Interactions

- If I request to "remember this session", or something like that, save something in
  `local/claude/sessions/<yyyyMMddHHmmss>.<recall_number>.<some descriptive name>.claude.session.md`
    - Use that for the duration of the session.
    - `recall_number` should be a sequential number of the loaded session. For example, in a fresh session,
       if I ask you to recall a session, the new session gets an incremented recall_number.
    - `yyyyMMddHHmmss` should represent the current timestamp at time of creating the session file.
- If we're working on a session we've already loaded and I ask you to save the session, prompt me about whether
  to overwrite the current one, or create a new one.

## Compaction

- If we're working in a session as described above, make sure that when compacting, you note which section we're working in.

## PR Comment Style

When writing comments that will be posted to GitHub PRs or inline code comments, match Brett's style:

- Use "we" instead of "the user" or "you" - it's collaborative
- Direct and concise - "This looks like a noop." not "It appears that this code might not have any effect."
- Use italics (`_word_`) for emphasis, especially _exactly_, _might_, _think_
- Ask questions to prompt thinking - "did you mean `.some()`?"
- When something's wrong, explain _why_ it's wrong, not just _that_ it's wrong
- Use code blocks liberally for suggestions
- Okay to be brief - "good catch" is a valid comment
- Conversational tone - "I _think_ this is the same?" not "This appears to be equivalent."
- "We should probably..." for soft suggestions
- Avoid formal/corporate phrasing - no "Consider implementing..." or "It is recommended that..."

## Pull Requests

- Do not include a "Test plan" section in GitHub PR descriptions.
- Do not include "Generated with Claude Code" or any similar attribution in PR descriptions.


## Shell Conventions

- Prefer relative paths over absolute paths for files within the working directory.
- Never create symlinks with absolute paths. Always use relative paths unless specifically directed otherwise. Symlink targets are relative to the link location, not the current working directory.
- Avoid using `cd` in shell commands. If you must run a command from a specific directory, use a subshell: `(cd some/dir && command)`
