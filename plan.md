# plan.md — Full Toolbox Awareness & Self-Authoring

**Goal:** The agent should be *aware* of everything in its Toolbox (agents, memories, prompts, skills, workflows) without needing discovery tool calls, and be able to *create, modify, and delete* any of those elements safely and correctly formatted.

## 1. Current State (already landed)

The execution backend exists; the gaps are awareness, format knowledge, and edit ergonomics.

| Piece | Where | Status |
|---|---|---|
| CRUD tools: `list/read/write/delete_toolbox_item` | `apps/web/src/lib/tools/toolbox-tools.ts` | ✅ done, gated behind `settings.allowSelfEnhancement` |
| `remember` (append-to-memory, always on) | `apps/web/src/lib/tools/memory-tools.ts` | ✅ done |
| Per-category content validation | `validateToolboxContent()` in toolbox-tools.ts | ⚠️ shallow (skills need `trigger`, prompts need `template`, workflows need `steps[].prompt`; agents only "frontmatter is an object") |
| Guardrails classification | `tools/categories.ts` (write=medium, delete=high, file_system) | ✅ done |
| Live store reload after write/delete | `reloadStores()` in toolbox-tools.ts | ✅ done |
| System-prompt guidance | chat-store `streamMessage` (~line 549): one paragraph naming the 4 tools | ⚠️ minimal — no inventory, no format docs |
| Runtime consumers | `lib/memory/resolve-memories.ts`, `lib/skills/resolve-skills.ts`, `lib/prompts/expand-prompt.ts`, `lib/workflows/run-workflow.ts`, `stores/agent-store.ts` | ✅ done |

**Gap summary:** today the agent (a) doesn't know what's in the Toolbox until it calls `list_toolbox_items`, (b) doesn't know the exact file format each category expects, so writes are trial-and-error against shallow validation, (c) can only overwrite whole files — no targeted edit — and (d) validation accepts agent/workflow files the runtime would silently misread.

---

## 2. Phase A — Awareness: inject a Toolbox inventory into the system prompt

**New module:** `apps/web/src/lib/toolbox/toolbox-inventory.ts`

- `buildToolboxInventory(): Promise<string>` — renders a compact index of every category:
  ```
  ## Toolbox
  agents: researcher (web research, tools: web_search…), coder (…)
  prompts: /summarize — "Summarize the given text…", /translate — …
  skills: git-helper (trigger: git|commit), …
  workflows: morning-brief (3 steps, scheduled 08:00), …
  memories: SOUL, USER, learned (+2 alwaysInclude)
  ```
- One line per item: name + a short descriptor pulled from frontmatter (`description`, `trigger`, agent `model`, workflow step count). Truncate descriptors with the existing `truncateText()`; cap total output (~1,500 chars — count it against `contextBudget` like memories/skills already are).
- Memories list **names only** (bodies are already injected by `resolve-memories.ts`; don't duplicate content).
- Reuse `listToolboxItems`/`loadToolboxItem` from `storage.ts`; parse frontmatter with `gray-matter` / `YAML` exactly as `toolbox-tools.ts` does.

**Wiring:** in chat-store `streamMessage`, after the skills index injection, append the inventory section. Inject it **always** (awareness is read-only and safe), independent of `allowSelfEnhancement`. Follow with a one-liner: "Use `read_toolbox_item` for full content of any item."

**Tests:** `toolbox-inventory.test.ts` — empty toolbox, descriptor extraction per category, truncation cap, malformed frontmatter tolerated (falls back to name only).

## 3. Phase B — Format knowledge: canonical schemas + authoring reference

**New module:** `apps/web/src/lib/toolbox/toolbox-schemas.ts` — single source of truth per category:

- Zod schemas (zod is already a catalog dep):
  - `agents`: markdown + frontmatter `{ name?, description?, model?: string, temperature?: number (0–2), tools?: string[] }`; `tools` entries validated against `TOOL_DEFINITIONS` names (warn-level: unknown tool → error message listing valid names).
  - `skills`: frontmatter `{ trigger: string (non-empty), description? }` + non-empty body.
  - `prompts`: YAML `{ template: string (non-empty), description?, args? }`.
  - `workflows`: YAML `{ description?, schedule?: string, steps: [{ prompt: string, agent?: string }]+ }`; `{{previous}}`/`{{input}}` placeholders permitted, unknown `agent` names rejected against agent-store.
  - `memories`: optional frontmatter `{ alwaysInclude?: boolean, description? }` + markdown body.
- `TOOLBOX_FORMAT_REFERENCE: Record<category, string>` — a 5–10-line authoring template per category (frontmatter fields, one minimal example each). This is the text the model sees.

**Refactors:**
- `validateToolboxContent()` in `toolbox-tools.ts` delegates to these schemas (keeps its `ValidationResult` shape; error messages must stay actionable — include the field and an example).
- When `allowSelfEnhancement` is on, append `TOOLBOX_FORMAT_REFERENCE` (all 5 categories, ~40 lines) to the Self-Enhancement system-prompt section so the agent writes valid content on the first try instead of learning the format from validation errors.
- Optional (skip if prompt budget is tight): `toolbox-editor.tsx` surfaces the same schema validation inline so human edits and agent edits share one contract.

**Tests:** extend `toolbox-tools.test.ts` — valid/invalid fixtures per category, unknown-tool and unknown-agent rejection, error-message content.

## 4. Phase C — Modification ergonomics: targeted edits

Whole-file overwrite is risky for the model on long files (it must reproduce everything it isn't changing). Add one tool:

**`edit_toolbox_item`** in `toolbox-tools.ts` + definition in `tools.ts`:
- Args: `{ category, name, old_string, new_string }` — exact-match single replacement (the proven Claude-Code Edit semantics: fail if `old_string` is missing or ambiguous, with a count in the error).
- Result is re-validated with the Phase B schema **after** replacement; invalid result → reject, file untouched.
- Guardrails: same as `write_toolbox_item` (file_system / medium / confirm). Add to `TOOLBOX_TOOL_NAMES`, `categories.ts` ALL_TOOLS, and the executor switch in `tools.ts` (~line 521).
- Update the Self-Enhancement guidance: "prefer `edit_toolbox_item` for small changes; `write_toolbox_item` for new items or rewrites."

**Confirmation UX (tool-call card):** for `write_toolbox_item` on an *existing* item and for `edit_toolbox_item`, show a before/after diff in the confirmation prompt instead of only the raw content, so the user approves a change, not a blob. (Reuse whatever diff rendering exists for file tools; if none, a simple removed/added line list is enough — keep it small.)

**Tests:** exact-match/ambiguous/missing `old_string`, post-edit validation rejection leaves file unchanged, executor wiring.

## 5. Phase D — Safety rails & polish

1. **Protected items:** `delete_toolbox_item` and destructive overwrites of `SOUL`/`USER` memories are refused at the executor level (agent may *append/edit* them, never delete). Mirrors `isWellKnown()` in memory-tools.ts — move that predicate into `toolbox-schemas.ts` and share it.
2. **Self-referential coherence:** after writing an `agents` item that is the *currently selected* agent, `reloadStores()` already reloads agent-store — verify the live conversation picks up the new system prompt on the *next* message (document; don't hot-swap mid-stream).
3. **Undo:** wire toolbox writes/deletes into the existing UndoManager if cheap (store prior `ToolboxItemData`, restore on undo; set `supportsUndo: true`). If the UndoManager only covers fs tools, defer — note it as follow-up rather than forcing it.
4. **Workflow/schedule side effects:** writing a workflow with a `schedule:` must refresh the scheduler-runner's in-memory map (same tick-registration path `scheduler-runner.ts` uses). Verify `reloadStores()` covers it; if not, add the refresh.

## 6. Build order & verification

1. Phase B (schemas) — everything else validates through it.
2. Phase A (inventory) — independent of B, can go in parallel.
3. Phase C (edit tool + diff confirm) — depends on B.
4. Phase D (rails) — last, touches all of the above.

Each phase lands green on: `bun run check-types`, `bun run test`, `bun run lint` (58-warning baseline), `bun run build`.

**End-to-end acceptance:**
- With a populated toolbox, a fresh conversation's system prompt contains the inventory; asking "what workflows do you have?" is answered without a tool call.
- With `allowSelfEnhancement` on: "create a skill that triggers on 'deploy'" produces a valid skill file on the **first** write (no validation retry), the skill fires in the same session, and the confirmation card showed the content.
- "Change the researcher agent's temperature to 0.5" uses `edit_toolbox_item`, the confirmation shows a one-line diff, and the reloaded agent-store reflects it.
- Deleting `SOUL` is refused with a clear message.

**Out of scope:** UI redesign of the Toolbox tabs, multi-file skills, remote/sync of toolbox items, per-agent self-enhancement permissions.
