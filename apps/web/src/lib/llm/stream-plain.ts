import { streamSimple, type Api, type Model, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import { messagesToPiMessages } from "@/lib/message-conversion";
import { stripProtocolMarkers } from "@/lib/protocol-parser";
import type { Message } from "@/stores/chat-store";

/**
 * Stream a reply without tools (the web-only path, where the agent adapter
 * isn't available). `onContent` receives the full reply so far with protocol
 * markers stripped. A stream error is thrown, with `fallbackError` when the
 * provider gave no message.
 */
export async function streamPlain(params: {
  model: Model<Api>;
  systemPrompt: string;
  /** History to send. Must not include the empty assistant message being filled. */
  messages: Message[];
  options: SimpleStreamOptions;
  fallbackError: string;
  onContent: (content: string) => void;
}): Promise<void> {
  const { model, systemPrompt, messages, options, fallbackError, onContent } = params;
  const stream = streamSimple(
    model,
    { systemPrompt, messages: messagesToPiMessages(messages, model.api, model.provider, model.id) },
    options
  );

  let fullContent = "";
  for await (const event of stream) {
    if (event.type === "text_delta") {
      fullContent += event.delta;
      onContent(stripProtocolMarkers(fullContent));
    } else if (event.type === "error") {
      throw new Error(event.error.errorMessage || fallbackError);
    }
  }
}
