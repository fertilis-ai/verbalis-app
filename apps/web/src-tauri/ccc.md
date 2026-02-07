# Claude Code Changelog Summary

Below is a concise summary of the most recent changes to Claude Code, extracted from the official `CHANGELOG.md` (latest release **2.1.34**).  The list focuses on new features, bug fixes, and improvements that may be relevant to users.

## 2.1.34 (latest)
- **Crash Fix** – Resolved a crash that occurred when the *agent teams* setting changed between renders.
- **Sandboxing Bug Fix** – Corrected a bug where commands excluded from sandboxing could bypass the Bash‑ask permission rule when `autoAllowBashIfSandboxed` was enabled.

## 2.1.33
- Added **TeammateIdle** and **TaskCompleted** hook events for multi‑agent workflows.
- Introduced support to restrict sub‑agents via `Task(agent_type)` syntax in agent frontmatter.
- Added **memory** frontmatter field for persistent memory (`user`, `project`, or `local`).
- Enhanced skill discoverability: plugin name appears in descriptions and `/skills` menu.
- Fixed interruption of extended thinking when submitting a new message.
- Various API error fixes, proxy compatibility, and VS Code UI improvements.

## 2.1.32
- **Claude Opus 4.6** now available.
- Added *research preview* agent‑teams feature (token‑intensive, opt‑in).
- Automatic recording and recall of memories.
- New **Summarize from here** message selector.
- Skills in additional directories (`--add-dir`) are auto‑loaded.
- Bash tool bug fix for heredoc JavaScript template literals.
- Skill character budget now scales with context window.

## 2.1.31
- Session resume hint on exit.
- Full‑width space support for Japanese IME in checkbox selection.
- Fixed PDF size errors and read‑only file system sandbox bugs.
- Temperature override bug fix in streaming API.
- LSP shutdown compatibility improvements.

## 2.1.30
- Added `pages` parameter to the Read tool for PDFs.
- Pre‑configured OAuth client credentials for MCP servers.
- `/debug` command added.
- Additional `git log/show` flags support in read‑only mode.
- Token count, tool uses, and duration metrics now shown in Task results.
- Reduced motion mode added to config.

*(Earlier releases contain additional fixes and enhancements – see the full changelog for details.)*
