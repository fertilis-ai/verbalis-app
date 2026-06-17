/**
 * Workflow executor — workflows are `.yaml` files in the Toolbox "workflows"
 * category: an optional `trigger.schedule` (cron) and an ordered list of
 * `steps[{agent, prompt}]`. Each step runs through the normal agent loop in a
 * single shared background conversation, so later steps see earlier steps'
 * output as conversation history. A `{{previous}}` placeholder in a step prompt
 * is replaced with the prior step's text output, and `{{input}}` with an
 * optional run input.
 *
 * Scheduling hooks into the existing scheduler tick (see scheduler-runner.ts);
 * this module is the executor and parser.
 */

import YAML from "yaml";
import { loadToolboxItem, listToolboxItems } from "@/lib/storage";
import { useChatStore } from "@/stores/chat-store";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { YOLO_MODE_CONFIG } from "@/lib/guardrails/presets";

export interface WorkflowStep {
  agent?: string;
  prompt: string;
}

export interface WorkflowTrigger {
  schedule?: string;
}

export interface Workflow {
  name: string;
  trigger?: WorkflowTrigger;
  steps: WorkflowStep[];
}

/** Parse workflow YAML content into a validated Workflow, or null if invalid. */
export function parseWorkflow(name: string, content: string): Workflow | null {
  let data: unknown;
  try {
    data = YAML.parse(content);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const rawSteps = obj.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return null;

  const steps: WorkflowStep[] = [];
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== "object") return null;
    const step = raw as Record<string, unknown>;
    if (typeof step.prompt !== "string") return null;
    steps.push({
      prompt: step.prompt,
      agent: typeof step.agent === "string" ? step.agent : undefined,
    });
  }

  const trigger = obj.trigger as Record<string, unknown> | undefined;
  return {
    name: typeof obj.name === "string" ? obj.name : name,
    trigger:
      trigger && typeof trigger.schedule === "string"
        ? { schedule: trigger.schedule }
        : undefined,
    steps,
  };
}

export async function loadWorkflow(name: string): Promise<Workflow | null> {
  const item = await loadToolboxItem("workflows", name);
  if (!item) return null;
  return parseWorkflow(name, item.content);
}

export async function listWorkflows(): Promise<string[]> {
  try {
    return await listToolboxItems("workflows");
  } catch {
    return [];
  }
}

function substitute(template: string, input: string, previous: string): string {
  return template.split("{{input}}").join(input).split("{{previous}}").join(previous);
}

/** Read the latest assistant text from a (possibly background) conversation. */
function lastAssistantContent(conversationId: string): string {
  const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  if (!conv) return "";
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === "assistant") return conv.messages[i].content ?? "";
  }
  return "";
}

export interface RunWorkflowResult {
  conversationId: string | null;
  stepOutputs: string[];
  error?: string;
}

export interface RunWorkflowOptions {
  input?: string;
  guardrailsConfig?: GuardrailsConfig;
  onConversationCreated?: (conversationId: string) => void;
}

/**
 * Run a workflow end-to-end. Steps share one background conversation; each
 * step's prompt may reference `{{input}}` and `{{previous}}`.
 */
export async function runWorkflow(
  workflow: Workflow,
  options: RunWorkflowOptions = {}
): Promise<RunWorkflowResult> {
  const input = options.input ?? "";
  // Background/scheduled runs can't surface confirmation UI, so default to the
  // autonomous (no-confirmation) guardrail config, matching the scheduler.
  const guardrailsConfig = options.guardrailsConfig ?? YOLO_MODE_CONFIG;

  const chat = useChatStore.getState();
  const conversation = await chat.createConversationInBackground({
    title: `Workflow: ${workflow.name}`,
  });
  options.onConversationCreated?.(conversation.id);

  const stepOutputs: string[] = [];
  let previous = input;

  try {
    for (const step of workflow.steps) {
      const prompt = substitute(step.prompt, input, previous);
      await chat.sendMessageToConversation(conversation.id, prompt, {
        agentId: step.agent ?? null,
        allowAutoRename: false,
        setStreaming: false,
        guardrailsConfig,
      });
      const output = lastAssistantContent(conversation.id);
      stepOutputs.push(output);
      previous = output;
    }
    return { conversationId: conversation.id, stepOutputs };
  } catch (error) {
    return {
      conversationId: conversation.id,
      stepOutputs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Convenience: load a workflow by name and run it. */
export async function runWorkflowByName(
  name: string,
  options?: RunWorkflowOptions
): Promise<RunWorkflowResult> {
  const workflow = await loadWorkflow(name);
  if (!workflow) {
    return { conversationId: null, stepOutputs: [], error: `Workflow "${name}" not found or invalid.` };
  }
  return runWorkflow(workflow, options);
}
