English · [简体中文](README.zh.md)

# clink

A lightweight desktop terminal for running the Claude Code, Codex, and Grok CLIs side by side. Built on Tauri (Rust + the system webview) and xterm.js, so there is no bundled Chromium and the app stays small (~6 MB installed).

clink is just a thin shell around the real CLIs: it runs each one in its own PTY, so every skill, plugin, MCP server, and slash command those tools support works unchanged.

## Download

Grab the latest `.app` from [Releases](https://github.com/aaronsun0811-dot/clink/releases).

The build is for Apple Silicon (arm64) and is not code-signed, so the first launch needs one of:

- Right-click `clink.app` → Open → Open, or
- Clear the download quarantine: `xattr -dr com.apple.quarantine /Applications/clink.app`

For Intel Macs, or if you prefer, build from source (below).

## Build from source

Requires Node, the Rust toolchain, and the `claude` / `codex` / `grok` CLIs installed on your `PATH`.

```bash
git clone https://github.com/aaronsun0811-dot/clink
cd clink
npm install        # first time
npm run tauri dev  # dev mode, opens the window
```

Run it from your own terminal app: a GUI process launched from a non-interactive background process has no window session and exits immediately.

Package a release build:

```bash
npm run tauri build
```

## Features

- Three CLIs: launch Claude / Codex / Grok in any pane, each in its own PTY.
- Columns and tabs: up to 3 resizable columns (drag the divider), unlimited tabs per column (+ to add, ✕ to close). Switching tabs is instant, with no flicker.
- Resume past sessions: the History panel lists prior conversations from all three tools, filterable by title or directory; click one to resume it in its original working directory. Sessions can be pinned or deleted (delete removes the files from disk, with confirmation).
- Skills panel: scans `~/.claude`, `~/.codex/skills`, and `~/.grok/skills`, grouped by tool; click a skill to insert its `/name` into the matching pane.
- Enable / disable skills: toggle any user skill with one click. Disabling moves its folder to `~/.<tool>/skills-disabled/` and enabling moves it back, so it is reversible and loses nothing.
- Import skills: pick a target tool, then enter a path or drop a folder onto the window to copy a `SKILL.md` folder into that tool's `skills/`.
- New file / folder, with a native folder picker for the directory.
- Open the current working directory in Finder.
- Bilingual UI: a 中/EN toolbar button switches language; the choice is saved locally.

## Where it reads from

- Claude sessions: `~/.claude/projects/<dir>/<id>.jsonl`
- Codex sessions: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, indexed in `~/.codex/session_index.jsonl`
- Grok sessions: `~/.grok/sessions/<encoded-dir>/<id>/chat_history.jsonl`
- Skills: each tool's `skills/` (and the `skills-disabled/` area), plus `plugins/` for Claude

PTY output is streamed over a Tauri binary Channel (raw bytes, not JSON), and terminals render with the xterm.js WebGL renderer.

## Known limitation

Each terminal uses one WebGL context, and browsers cap the number of simultaneous WebGL contexts (around 16). With a very large number of tabs open, an individual terminal may lose its WebGL context and fall back to the default DOM renderer (handled via `onContextLoss`, so it never crashes, that one terminal just repaints a little slower). Normal use stays well under that limit.

## License

MIT
