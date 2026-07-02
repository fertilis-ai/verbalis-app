import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SpeechPlaybackStatus } from "@/lib/hooks/use-speech-playback";

const mockToggle = vi.fn();
let mockStatus: SpeechPlaybackStatus = "idle";

vi.mock("@/lib/hooks/use-speech-playback", () => ({
  useSpeechPlayback: () => ({ status: mockStatus, toggle: mockToggle }),
}));

const mockSettingsState = {
  speechModel: "x-ai/grok-voice-tts-1.0",
  apiKeys: { anthropic: "", openai: "", google: "", openrouter: "sk-or-key" },
};

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: (selector: (s: typeof mockSettingsState) => unknown) =>
    selector(mockSettingsState),
}));

import { SpeechButton } from "./speech-button";

describe("SpeechButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus = "idle";
    mockSettingsState.speechModel = "x-ai/grok-voice-tts-1.0";
    mockSettingsState.apiKeys.openrouter = "sk-or-key";
  });

  it("renders nothing when no speech model is configured", () => {
    mockSettingsState.speechModel = "";
    const { container } = render(<SpeechButton text="Hello" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the OpenRouter key is missing", () => {
    mockSettingsState.apiKeys.openrouter = "  ";
    const { container } = render(<SpeechButton text="Hello" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the read-aloud button when configured", () => {
    render(<SpeechButton text="Hello" />);
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  });

  it("toggles playback on click", () => {
    render(<SpeechButton text="Hello" />);
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("shows a cancel affordance while loading", () => {
    mockStatus = "loading";
    render(<SpeechButton text="Hello" />);
    expect(
      screen.getByRole("button", { name: "Generating audio… (click to cancel)" })
    ).toBeInTheDocument();
  });

  it("shows a stop affordance while playing", () => {
    mockStatus = "playing";
    render(<SpeechButton text="Hello" />);
    expect(screen.getByRole("button", { name: "Stop playback" })).toBeInTheDocument();
  });
});
