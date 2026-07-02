import { appFetch } from "@/lib/http";

const TRANSCRIPTIONS_API_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
// OpenRouter's transcription upstream times out around 60s.
const TRANSCRIPTION_TIMEOUT_MS = 60_000;

export type AudioFormat = "webm" | "m4a" | "ogg" | "wav" | "mp3";

/** Map a MediaRecorder mimeType to the OpenRouter input_audio format string. */
export function formatFromMimeType(mimeType: string): AudioFormat {
  if (mimeType.includes("mp4")) return "m4a"; // Safari/WKWebView records audio/mp4
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

/** Convert a Blob to raw base64 (no data-URI prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio blob"));
    reader.readAsDataURL(blob);
  });
}

async function readErrorMessage(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { error?: { message?: string } };
    if (body.error?.message) return `HTTP ${resp.status}: ${body.error.message}`;
  } catch {
    // not JSON
  }
  return `HTTP ${resp.status}`;
}

/** Transcribe an audio blob via OpenRouter's speech-to-text API. */
export async function transcribeAudio(
  blob: Blob,
  opts: { model: string; apiKey: string; format: AudioFormat }
): Promise<string> {
  const resp = await appFetch(TRANSCRIPTIONS_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input_audio: { data: await blobToBase64(blob), format: opts.format },
    }),
    signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Transcription failed (${await readErrorMessage(resp)})`);
  const result = (await resp.json()) as { text?: string };
  return result.text ?? "";
}
