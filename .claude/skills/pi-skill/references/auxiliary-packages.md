# Pi Auxiliary Packages Reference

Reference for web-ui, mom, and pods packages.

---

## @mariozechner/pi-web-ui

Reusable browser components for AI chat interfaces.

### Installation

```bash
npm install @mariozechner/pi-web-ui @mariozechner/pi-agent @mariozechner/pi-ai
```

### Architecture

```
┌─────────────────────────────────────────┐
│              ChatPanel                   │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │ AgentInterface│  │ ArtifactsPanel   │ │
│  │ (messages)    │  │ (HTML/SVG/MD)    │ │
│  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Agent (from pi-agent)            │
│  - State management                      │
│  - Event emission                        │
│  - Tool execution                        │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│              AppStorage                  │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐  │
│  │ Settings │ │ Provider │ │Sessions │  │
│  │  Store   │ │Keys Store│ │ Store   │  │
│  └──────────┘ └──────────┘ └─────────┘  │
│              IndexedDB Backend           │
└─────────────────────────────────────────┘
```

### Quick Start

```typescript
import { Agent } from '@mariozechner/pi-agent';
import { getModel } from '@mariozechner/pi-ai';
import {
  ChatPanel,
  AppStorage,
  IndexedDBStorageBackend,
  ProviderKeysStore,
  SessionsStore,
  SettingsStore,
  setAppStorage,
  defaultConvertToLlm,
  ApiKeyPromptDialog,
} from '@mariozechner/pi-web-ui';
import '@mariozechner/pi-web-ui/app.css';

// Set up storage
const settings = new SettingsStore();
const providerKeys = new ProviderKeysStore();
const sessions = new SessionsStore();

const backend = new IndexedDBStorageBackend({
  dbName: 'my-app',
  version: 1,
  stores: [
    settings.getConfig(),
    providerKeys.getConfig(),
    sessions.getConfig(),
    SessionsStore.getMetadataConfig(),
  ],
});

settings.setBackend(backend);
providerKeys.setBackend(backend);
sessions.setBackend(backend);

const storage = new AppStorage(settings, providerKeys, sessions, undefined, backend);
setAppStorage(storage);

// Create agent
const agent = new Agent({
  initialState: {
    systemPrompt: 'You are a helpful assistant.',
    model: getModel('anthropic', 'claude-sonnet-4-5-20250929'),
    thinkingLevel: 'off',
    messages: [],
    tools: [],
  },
  convertToLlm: defaultConvertToLlm,
});

// Create chat panel
const chatPanel = new ChatPanel();
await chatPanel.setAgent(agent, {
  onApiKeyRequired: (provider) => ApiKeyPromptDialog.prompt(provider),
});

document.body.appendChild(chatPanel);
```

### Components

**ChatPanel** - High-level chat with artifacts panel

**AgentInterface** - Lower-level chat without artifacts:

```typescript
const chat = document.createElement('agent-interface');
chat.session = agent;
chat.enableAttachments = true;
chat.enableModelSelector = true;
```

**ArtifactsPanel** - HTML/SVG/Markdown viewer

### Built-in Tools

**JavaScript REPL** - Sandboxed JS execution:

```typescript
import { createJavaScriptReplTool } from '@mariozechner/pi-web-ui';

const replTool = createJavaScriptReplTool();
agent.setTools([replTool]);
```

**Extract Document** - PDF, DOCX extraction:

```typescript
import { createExtractDocumentTool } from '@mariozechner/pi-web-ui';

const extractTool = createExtractDocumentTool();
agent.setTools([extractTool]);
```

### Attachments

```typescript
import { loadAttachment } from '@mariozechner/pi-web-ui';

// From File
const attachment = await loadAttachment(file);

// From URL
const attachment = await loadAttachment('https://example.com/doc.pdf');

// Attachment structure
interface Attachment {
  id: string;
  type: 'image' | 'document';
  fileName: string;
  mimeType: string;
  size: number;
  content: string;        // base64
  extractedText?: string;
  preview?: string;       // base64 preview
}
```

Supported: PDF, DOCX, XLSX, PPTX, images, text files.

### Custom Message Types

```typescript
interface SystemNotification {
  role: 'system-notification';
  message: string;
  timestamp: string;
}

declare module '@mariozechner/pi-agent' {
  interface CustomAgentMessages {
    'system-notification': SystemNotification;
  }
}

// Register renderer
registerMessageRenderer('system-notification', {
  render: (msg) => html`<div class="alert">${msg.message}</div>`,
});

// Extend convertToLlm
function myConvertToLlm(messages) {
  const processed = messages.filter(m => m.role !== 'system-notification');
  return defaultConvertToLlm(processed);
}
```

### Storage

```typescript
// Settings
await storage.settings.set('proxy.enabled', true);
const enabled = await storage.settings.get<boolean>('proxy.enabled');

// API Keys
await storage.providerKeys.set('anthropic', 'sk-ant-...');
const key = await storage.providerKeys.get('anthropic');

// Sessions
await storage.sessions.save(sessionData, metadata);
const data = await storage.sessions.get(sessionId);
const allMetadata = await storage.sessions.getAllMetadata();
```

### Dialogs

```typescript
import { SettingsDialog, SessionListDialog, ApiKeyPromptDialog, ModelSelector } from '@mariozechner/pi-web-ui';

// Settings dialog
SettingsDialog.open([new ProvidersModelsTab(), new ProxyTab(), new ApiKeysTab()]);

// Session list
SessionListDialog.open(onLoad, onDelete);

// API key prompt
await ApiKeyPromptDialog.prompt('anthropic');

// Model selector
ModelSelector.open(currentModel, onSelect);
```

---

## @mariozechner/pi-mom

Self-managing Slack bot powered by LLM.

### Installation

```bash
npm install @mariozechner/pi-mom
```

### Features

- **Self-Managing**: Installs tools, writes scripts, configures credentials autonomously
- **Slack Integration**: Responds to @mentions in channels and DMs
- **Docker Sandbox**: Isolate in a container (recommended)
- **Persistent Workspace**: All data in one directory
- **Skills System**: Creates custom CLI tools for specific tasks

### Quick Start

```bash
# Set environment variables
export MOM_SLACK_APP_TOKEN=xapp-...
export MOM_SLACK_BOT_TOKEN=xoxb-...
export ANTHROPIC_API_KEY=sk-ant-...

# Create Docker sandbox
docker run -d \
  --name mom-sandbox \
  -v $(pwd)/data:/workspace \
  alpine:latest \
  tail -f /dev/null

# Run mom
mom --sandbox=docker:mom-sandbox ./data
```

### Data Structure

```
./data/
├── MEMORY.md                 # Global memory
├── settings.json             # Global settings
├── skills/                   # Global skills
├── C123ABC/                  # Per channel
│   ├── MEMORY.md             # Channel memory
│   ├── log.jsonl             # Full history
│   ├── context.jsonl         # LLM context
│   ├── attachments/
│   ├── scratch/
│   └── skills/               # Channel skills
```

### Tools

- **bash**: Execute shell commands
- **read**: Read file contents
- **write**: Create/overwrite files
- **edit**: Edit existing files
- **attach**: Share files to Slack

### Skills

Skills are custom CLI tools mom creates. Each has a `SKILL.md`:

```markdown
---
name: gmail
description: Read, search, and send Gmail via IMAP/SMTP
---

# Gmail Skill

## Usage
\`\`\`bash
bash {baseDir}/gmail.sh read
\`\`\`
```

### Events

Schedule wake-ups via JSON files in `data/events/`:

```json
// Immediate
{"type": "immediate", "channelId": "C123", "text": "New issue"}

// One-shot
{"type": "one-shot", "channelId": "C123", "text": "Reminder", "at": "2025-12-15T09:00:00+01:00"}

// Periodic
{"type": "periodic", "channelId": "C123", "text": "Check inbox", "schedule": "0 9 * * 1-5", "timezone": "Europe/Vienna"}
```

### Security

**Docker mode** (recommended):
- Isolated container
- Only accesses mounted data directory
- Credentials isolated to container

**Host mode** (not recommended):
- Full system access
- Only use in disposable VMs

---

## @mariozechner/pi (Pods)

Deploy and manage LLMs on GPU pods with vLLM.

### Installation

```bash
npm install -g @mariozechner/pi
```

### Quick Start

```bash
# Set tokens
export HF_TOKEN=your_huggingface_token
export PI_API_KEY=your_api_key

# Setup pod
pi pods setup dc1 "ssh root@1.2.3.4" \
  --mount "sudo mount -t nfs nfs.datacrunch.io:/hf-models /mnt/hf-models"

# Start model
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen

# Interactive chat
pi agent qwen -i

# API usage
export OPENAI_BASE_URL='http://1.2.3.4:8001/v1'
export OPENAI_API_KEY=$PI_API_KEY
```

### Commands

```bash
# Pod management
pi pods setup <name> "<ssh>" [--mount "..."] [--vllm release|nightly|gpt-oss]
pi pods                          # List pods
pi pods active <name>            # Switch active
pi pods remove <name>            # Remove
pi shell [<name>]                # SSH into pod
pi ssh [<name>] "<command>"      # Run command

# Model management
pi start <model> --name <name> [--memory 90%] [--context 32k] [--gpus 2]
pi stop [<name>]                 # Stop model
pi list                          # List running
pi logs <name>                   # Stream logs

# Agent
pi agent <name> "<message>"      # Single message
pi agent <name> -i               # Interactive
pi agent <name> -i -c            # Continue session
```

### Supported Providers

**Primary:**
- **DataCrunch** - NFS volumes shareable across pods
- **RunPod** - Network volumes persist independently

**Also works:**
- Vast.ai, Prime Intellect, AWS EC2
- Any Ubuntu machine with NVIDIA GPUs and SSH

### Predefined Models

```bash
# Qwen
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen
pi start Qwen/Qwen3-Coder-30B-A3B-Instruct --name qwen3

# GPT-OSS (requires --vllm gpt-oss during setup)
pi start openai/gpt-oss-20b --name gpt20
pi start openai/gpt-oss-120b --name gpt120

# GLM
pi start zai-org/GLM-4.5 --name glm
pi start zai-org/GLM-4.5-Air --name glm-air
```

### Custom vLLM Arguments

```bash
pi start some/model --name custom --vllm \
  --tensor-parallel-size 4 \
  --trust-remote-code \
  --enable-auto-tool-choice
```

### Memory & Context

```bash
# GPU memory allocation
--memory 30%    # High concurrency, limited context
--memory 50%    # Balanced (default)
--memory 90%    # Maximum context

# Context window
--context 4k    # 4,096 tokens
--context 32k   # 32,768 tokens
--context 128k  # 131,072 tokens
```

### API Integration

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://your-pod-ip:8001/v1",
    api_key="your-pi-api-key"
)

response = client.chat.completions.create(
    model="Qwen/Qwen2.5-Coder-32B-Instruct",
    messages=[{"role": "user", "content": "Hello"}],
    tools=[...],
    tool_choice="auto"
)
```

### Standalone Agent

```bash
# Install
npm install -g @mariozechner/pi

# Use with any OpenAI-compatible API
pi-agent --base-url http://localhost:8000/v1 --model llama "Hello"
pi-agent --api-key sk-... "What is 2+2?"
pi-agent -i                    # Interactive
pi-agent --json "Query"        # JSONL output
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `HF_TOKEN` | HuggingFace token |
| `PI_API_KEY` | API key for vLLM endpoints |
| `PI_CONFIG_DIR` | Config directory (default: `~/.pi`) |
| `OPENAI_API_KEY` | Used by `pi-agent` |
