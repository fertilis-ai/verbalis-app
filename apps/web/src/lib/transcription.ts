import { readErrorBody } from "@/lib/http";
import { openRouterFetch } from "@/lib/openrouter";

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

/** Read a Blob's bytes (FileReader rather than Blob.arrayBuffer, which jsdom lacks). */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio blob"));
    reader.readAsArrayBuffer(blob);
  });
}

/** The parts of an AudioBuffer that WAV encoding reads. */
export type PcmSource = Pick<AudioBuffer, "numberOfChannels" | "sampleRate" | "length" | "getChannelData">;

/** Encode decoded audio as a 16-bit PCM mono WAV file (channels are averaged). */
export function encodeWav(audio: PcmSource): ArrayBuffer {
  const { numberOfChannels, sampleRate, length } = audio;
  const channels = Array.from({ length: numberOfChannels }, (_, i) => audio.getChannelData(i));
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    let sample = 0;
    for (const channel of channels) sample += channel[i];
    sample = Math.max(-1, Math.min(1, sample / Math.max(1, numberOfChannels)));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return view.buffer;
}

/**
 * Re-encode a recording as WAV, the format every OpenRouter transcription
 * provider accepts; WKWebView records webm/opus or mp4/aac, which some
 * providers reject with a 400. Resolves to null when the engine can't decode
 * the recording (or has no Web Audio), so the caller sends it as recorded.
 */
export async function recordingToWav(blob: Blob): Promise<Blob | null> {
  if (typeof AudioContext === "undefined") return null;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(await blobToArrayBuffer(blob));
    return new Blob([encodeWav(decoded)], { type: "audio/wav" });
  } catch {
    return null;
  } finally {
    void ctx?.close().catch(() => {});
  }
}

/**
 * Transcribe an audio blob via OpenRouter's speech-to-text API. The audio is
 * sent as WAV when it can be decoded, otherwise as recorded in `opts.format`.
 */
export async function transcribeAudio(
  blob: Blob,
  opts: { model: string; apiKey: string; format: AudioFormat; zdr?: boolean }
): Promise<string> {
  const wav = await recordingToWav(blob);
  const format: AudioFormat = wav ? "wav" : opts.format;
  const resp = await openRouterFetch("/audio/transcriptions", {
    apiKey: opts.apiKey,
    zdr: opts.zdr,
    body: {
      model: opts.model,
      input_audio: { data: await blobToBase64(wav ?? blob), format },
    },
    signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Transcription failed (${await readErrorBody(resp)}; sent ${format} audio)`);
  }
  const result = (await resp.json()) as { text?: string };
  return result.text ?? "";
}
