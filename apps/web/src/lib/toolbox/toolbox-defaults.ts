/**
 * Default Toolbox content — a starter set of prompts, skills, agents,
 * workflows, and memory templates for generic use (work, research, writing,
 * organization). Seeded once by `ensureDefaultToolboxItems()` in storage.ts,
 * guarded by a version marker so items a user deletes stay deleted. Bumping
 * TOOLBOX_DEFAULTS_VERSION seeds newly added defaults on the next launch
 * (existing files are never overwritten).
 *
 * This module is pure data: no imports, so it can be consumed by storage.ts
 * and validated in tests without dragging in the storage/tool import chains.
 * Every item must satisfy the canonical schema for its category in
 * toolbox-schemas.ts — toolbox-defaults.test.ts enforces this.
 */

export type DefaultToolboxCategory =
  | "prompts"
  | "memories"
  | "agents"
  | "skills"
  | "workflows";

export interface DefaultToolboxItem {
  category: DefaultToolboxCategory;
  /** Filename without extension. For prompts this is the /slash-command name. */
  name: string;
  content: string;
}

export const TOOLBOX_DEFAULTS_VERSION = 2;

// ---------------------------------------------------------------------------
// Prompts — /name slash commands; {{input}} is the text after the command
// ---------------------------------------------------------------------------

const PROMPTS: DefaultToolboxItem[] = [
  {
    category: "prompts",
    name: "summarize",
    content: `name: summarize
description: Condense any text into key points and a bottom line
template: |
  Summarize the following. Lead with a one-sentence bottom line, then give the
  key points as short bullets. Keep names, numbers, and dates exact. If
  something important is ambiguous or missing, say so rather than guessing.

  {{input}}
`,
  },
  {
    category: "prompts",
    name: "email",
    content: `name: email
description: Draft a clear, professional email from rough notes
template: |
  Draft a professional email from the notes below. Keep it short: a specific
  subject line, a one-sentence opener that states the purpose, the details in
  scannable form, and a clear ask or next step at the end. Match the formality
  to the audience; default to warm and direct.

  Notes:
  {{input}}
`,
  },
  {
    category: "prompts",
    name: "research",
    content: `name: research
description: Research a topic and return a sourced brief
template: |
  Research the following topic and produce a short brief:
  1. What it is and why it matters (2-3 sentences)
  2. Key facts and figures, each attributed to its source
  3. Where sources disagree, and open questions
  4. Sources consulted (with links)
  Use web search where available. Distinguish clearly between what the sources
  say and your own inference.

  Topic: {{input}}
`,
  },
  {
    category: "prompts",
    name: "brainstorm",
    content: `name: brainstorm
description: Generate diverse ideas, then shortlist the strongest
template: |
  Brainstorm ideas for the following. First produce 10-15 ideas spanning
  genuinely different approaches — include a few unconventional ones. Then
  pick the 3 strongest and give each a one-line pitch, its main risk, and a
  concrete first step.

  {{input}}
`,
  },
  {
    category: "prompts",
    name: "proofread",
    content: `name: proofread
description: Fix grammar and clarity while preserving the author's voice
template: |
  Proofread the text below. Fix grammar, spelling, punctuation, and awkward
  phrasing while preserving the author's voice and meaning. Return the
  corrected text first, then a short list of the substantive changes you made.

  {{input}}
`,
  },
  {
    category: "prompts",
    name: "explain",
    content: `name: explain
description: Explain a concept in plain language
template: |
  Explain the following in plain language for a smart reader who is new to the
  subject. Start with the core idea in one sentence, use a concrete example or
  analogy, and finish with the two or three details most worth remembering.

  {{input}}
`,
  },
];

// ---------------------------------------------------------------------------
// Skills — injected into the system prompt when the trigger matches
// ---------------------------------------------------------------------------

const SKILLS: DefaultToolboxItem[] = [
  {
    category: "skills",
    name: "toolbox-guide",
    content: `---
name: toolbox-guide
description: How to choose between prompts, skills, agents, workflows, and memories
trigger: "toolbox|workflow|automate|slash command|new skill|custom agent|save this"
---
The Toolbox is how this assistant grows: five kinds of editable files, each
with a distinct job. When the user wants to save, reuse, or automate
something, pick the right category:

- **Prompt** — a reusable one-shot request, invoked as /name in chat with
  {{input}} for the user's text. Use when the user keeps typing the same kind
  of request ("summarize this", "draft an email about...").
- **Skill** — standing guidance that is auto-injected whenever its trigger
  keywords match the user's message. Use for *how* to do something
  consistently (a method, a format, house style) — not for one-shot requests.
- **Agent** — a persona with its own system prompt, temperature, and optional
  tool allowlist, selected as the active chat agent. Use for a distinct role
  that benefits from restricted tools (a researcher with web tools, an
  organizer with no delete).
- **Workflow** — a sequence of prompts run in order in a background
  conversation, each step optionally handled by a specific agent;
  {{previous}} passes the prior step's output along. Add a cron trigger to
  run it on a schedule. Use for recurring multi-step jobs.
- **Memory** — durable facts. SOUL (identity) and USER (facts about the user)
  are always in context; other memories are included when alwaysInclude is
  true. Save new durable facts with the remember tool rather than editing
  files directly.

Rules of thumb:
- Repeated request → prompt. Repeated *way of doing things* → skill.
  Distinct role/toolset → agent. Multi-step or scheduled → workflow.
  Durable fact → memory.
- Suggest saving something when a pattern shows up, but let the user decide.
- Before creating anything, check the Toolbox inventory in your context and
  prefer improving an existing item over adding a near-duplicate.
`,
  },
  {
    category: "skills",
    name: "writing",
    content: `---
name: writing
description: Guidelines for drafting clear documents, emails, and posts
trigger: "write|draft|email|memo|blog|rewrite|proofread"
---
When helping the user write:

- Establish audience and purpose first; if unclear, make a reasonable
  assumption and state it rather than interrogating the user.
- Put the main point in the first sentence. Everything else supports it.
- Prefer short sentences and concrete words. Cut filler ("just", "very",
  "in order to") and hedges that add no information.
- Match the user's existing voice and formality — don't over-formalize
  casual writing or casualize formal writing.
- For emails: a specific subject line, the purpose up front, one clear ask.
- When revising someone's text, preserve their meaning and voice; list any
  substantive change you made.
- End action-oriented writing with an explicit next step.
`,
  },
  {
    category: "skills",
    name: "research",
    content: `---
name: research
description: Method for reliable research and fact-finding
trigger: "research|investigate|find out|look into|compare|sources|fact-check"
---
When researching for the user:

- Restate the question precisely before searching; note what would count as
  a complete answer.
- Search more than one phrasing of the question; prefer primary sources
  (papers, official docs, filings) over commentary.
- Cross-check every load-bearing claim against at least two independent
  sources; note when sources disagree instead of silently picking one.
- Record publication dates — flag anything that may be stale.
- Keep quotes exact and attributed. Never invent citations.
- Separate findings ("the sources say") from interpretation ("this suggests").
- Always end with the list of sources consulted.
`,
  },
  {
    category: "skills",
    name: "meetings",
    content: `---
name: meetings
description: Structure for meeting notes, minutes, and agendas
trigger: "meeting|minutes|agenda|action items|standup|1:1|retro"
---
When handling meeting notes or agendas:

For notes/minutes, organize into exactly these sections:
1. **Decisions** — what was decided, by whom
2. **Action items** — each with an owner and a due date (mark "TBD" if none
   was set, and flag it)
3. **Open questions** — unresolved points that need follow-up
4. **Discussion** — brief context, only what's needed to understand the above

For agendas: state the meeting's goal in one line, timebox each item, put
decisions-needed before status updates, and list any pre-reads.

Keep names and commitments exact — never soften or drop an owner or a date.
`,
  },
  {
    category: "skills",
    name: "planning",
    content: `---
name: planning
description: Method for breaking down goals into plans and priorities
trigger: "plan|roadmap|milestone|prioritize|deadline|schedule|break down"
---
When helping the user plan:

- Pin down the goal and the hard constraints (deadline, budget, people)
  before proposing steps.
- Break work into milestones with verifiable outcomes ("draft sent to X"),
  not vague activities ("work on draft").
- Sequence by dependency, then by risk: surface the riskiest assumption
  early so it fails fast and cheap.
- For prioritization, compare impact against effort and recommend an
  explicit order — don't just list options.
- Keep slack in any schedule; a plan with zero buffer is a prediction of
  failure.
- End with the single next action the user can take today.
`,
  },
];

// ---------------------------------------------------------------------------
// Agents — markdown frontmatter + system prompt body. `tools:` must name
// tools that exist in categories.ts ALL_TOOLS. Model is omitted so agents
// track the app's default model.
// ---------------------------------------------------------------------------

// The "default" orchestration agent is seeded by initAppDataDir (both
// platforms), so it is deliberately absent here.
const AGENTS: DefaultToolboxItem[] = [
  {
    category: "agents",
    name: "researcher",
    content: `---
name: researcher
description: Finds and synthesizes information from the web, with sources
temperature: 0.5
tools: [web_search, http_fetch, scrape_webpage, read_file, write_file, list_files, remember]
---
You are a research agent. You find, verify, and synthesize information.

Method:
- Restate the question and what a complete answer looks like before searching.
- Search multiple phrasings; prefer primary sources over commentary.
- Cross-check load-bearing claims against at least two independent sources;
  report disagreements instead of silently resolving them.
- Note publication dates and flag potentially stale information.
- Separate what the sources say from your own inference.

Output:
- Lead with the answer, then the supporting evidence.
- Attribute every fact and figure; keep quotes exact.
- End with a list of sources consulted (with links) and any open questions.
- When you learn a durable fact about the user's interests or ongoing work,
  save it with the remember tool.
`,
  },
  {
    category: "agents",
    name: "writer",
    content: `---
name: writer
description: Drafts and edits documents, emails, and other text
temperature: 0.8
tools: [read_file, write_file, list_files, read_directory, clipboard_read, clipboard_write]
---
You are a writing agent. You draft new text and edit existing text.

Principles:
- Establish audience and purpose first; state your assumption if it's unclear.
- Put the main point in the first sentence; keep sentences short and words
  concrete; cut filler.
- Match the requested (or the user's own) voice and formality.
- When editing, preserve the author's meaning and voice, and summarize the
  substantive changes you made.
- For structured pieces (emails, memos, posts), propose a skeleton first when
  the piece is long; otherwise just write it.

When asked to save work, write it to a file with a clear name and tell the
user where it is.
`,
  },
  {
    category: "agents",
    name: "organizer",
    content: `---
name: organizer
description: Tidies files and folders and keeps notes in order
temperature: 0.2
tools: [read_directory, list_files, path_exists, read_file, write_file, create_directory, rename_path]
---
You are an organization agent. You help keep files, folders, and notes tidy.

Rules:
- Look before you touch: list and read enough to understand the current
  structure before proposing changes.
- Propose the reorganization as a plan (what moves where, and why) and get
  confirmation before renaming or moving anything.
- Never delete — you don't have a delete tool by design. If something seems
  disposable, suggest the user review it instead.
- Prefer consistent, sortable names (kebab-case, ISO dates like 2026-07-11).
- When creating notes or indexes, keep them short and link to the source
  files rather than duplicating content.

Report what changed at the end: every file moved, renamed, or created.
`,
  },
];

// ---------------------------------------------------------------------------
// Workflows — steps run in order in one background conversation.
// {{input}} = workflow input, {{previous}} = prior step's output.
// `agent:` names must match seeded/existing agents.
// ---------------------------------------------------------------------------

const WORKFLOWS: DefaultToolboxItem[] = [
  {
    category: "workflows",
    name: "research-brief",
    content: `name: research-brief
description: Research a topic, then distill it into a one-page brief
# To run this automatically, add a cron trigger, e.g. every Monday at 8:00:
# trigger:
#   schedule: "0 8 * * 1"
steps:
  - agent: researcher
    prompt: |
      Research this topic thoroughly: {{input}}
      Collect the key facts and figures with at least three sources, and note
      where the sources disagree.
  - prompt: |
      Turn the research into a one-page brief: a two-sentence summary up top,
      the key findings as bullets, open questions, and the source list.

      {{previous}}
`,
  },
  {
    category: "workflows",
    name: "polish-draft",
    content: `name: polish-draft
description: Draft a piece of writing, critique it, then revise it
steps:
  - agent: writer
    prompt: "Write a first draft of: {{input}}"
  - prompt: |
      Critique this draft as a tough editor. List the biggest weaknesses in
      structure, clarity, and tone, each with a concrete fix.

      {{previous}}
  - agent: writer
    prompt: |
      Revise the draft, applying this critique. Return only the final version.

      {{previous}}
`,
  },
];

// ---------------------------------------------------------------------------
// Memories — SOUL and USER are seeded separately by ensureWellKnownMemories();
// this adds a fill-in template for standing work context.
// ---------------------------------------------------------------------------

const MEMORIES: DefaultToolboxItem[] = [
  {
    category: "memories",
    name: "work-context",
    content: `---
description: Standing facts about your work. Fill it in, then set alwaysInclude to true.
alwaysInclude: false
---

# Work Context

Fill this in with the standing facts the assistant should know about your
work, then set \`alwaysInclude: true\` above to inject it into every
conversation.

- **Role:**
- **Team / organization:**
- **Current projects:**
- **Tools you use:**
- **Recurring commitments:**
`,
  },
];

export const DEFAULT_TOOLBOX_ITEMS: DefaultToolboxItem[] = [
  ...PROMPTS,
  ...SKILLS,
  ...AGENTS,
  ...WORKFLOWS,
  ...MEMORIES,
];
