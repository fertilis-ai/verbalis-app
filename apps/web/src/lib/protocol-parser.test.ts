import { describe, it, expect } from "vitest";
import { parseProtocolMarkers, stripProtocolMarkers } from "./protocol-parser";

describe("parseProtocolMarkers", () => {
  describe("tool call extraction", () => {
    it("should extract tool call from Tauri app example", () => {
      const input = `<|channel|>commentary to=repo_browser.apply_patch code<|message|>{"patch":"*** Begin Patch\\n*** Update File: ~/Projects/new.md\\n+content\\n*** End Patch"}`;
      const result = parseProtocolMarkers(input);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("repo_browser.apply_patch");
      expect(result.toolCalls[0].arguments).toHaveProperty("patch");
      expect(result.cleanText).toBe("");
    });

    it("should extract tool call with <|constrain|> marker", () => {
      const input = `<|channel|>commentary to=repo_browser.open_file <|constrain|>json<|message|>{"path":"~/test.md"}`;
      const result = parseProtocolMarkers(input);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("repo_browser.open_file");
      expect(result.toolCalls[0].arguments).toEqual({ path: "~/test.md" });
      expect(result.cleanText).toBe("");
    });

    it("should extract tool call and preserve surrounding text", () => {
      const input = `I'll help you with that.\n<|channel|>commentary to=read_file code<|message|>{"path":"/test.txt"}\nDone!`;
      const result = parseProtocolMarkers(input);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("read_file");
      expect(result.cleanText).toContain("I'll help you with that.");
      expect(result.cleanText).toContain("Done!");
      expect(result.cleanText).not.toContain("<|channel|>");
    });

    it("should extract multiple tool calls", () => {
      const input = `<|channel|>commentary to=read_file code<|message|>{"path":"a.txt"}\n<|channel|>commentary to=write_file code<|message|>{"path":"b.txt","content":"hi"}`;
      const result = parseProtocolMarkers(input);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe("read_file");
      expect(result.toolCalls[1].name).toBe("write_file");
    });
  });

  describe("incomplete blocks (streaming)", () => {
    it("should detect incomplete block at end", () => {
      const input = `Some text <|channel|>commentary to=tool`;
      const result = parseProtocolMarkers(input);

      expect(result.hasIncompleteBlock).toBe(true);
      expect(result.cleanText).toBe("Some text");
    });

    it("should detect incomplete marker", () => {
      const input = `Some text <|chan`;
      const result = parseProtocolMarkers(input);

      expect(result.hasIncompleteBlock).toBe(true);
    });
  });

  describe("clean text extraction", () => {
    it("should preserve normal text", () => {
      const input = "This is normal text without any markers.";
      const result = parseProtocolMarkers(input);

      expect(result.cleanText).toBe("This is normal text without any markers.");
      expect(result.toolCalls).toHaveLength(0);
    });

    it("should handle text with angle brackets that are not markers", () => {
      const input = `5 < 10 and 10 > 5`;
      const result = parseProtocolMarkers(input);

      expect(result.cleanText).toBe("5 < 10 and 10 > 5");
    });

    it("should strip standalone JSON payloads", () => {
      const input = `{"patch":"*** Begin Patch\\n*** End Patch"}`;
      const result = parseProtocolMarkers(input);

      expect(result.cleanText).toBe("");
    });
  });
});

describe("stripProtocolMarkers", () => {
  it("should strip markers and return clean text", () => {
    const input = `Hello <|channel|>commentary to=tool code<|message|>{"arg":"value"} World`;
    const result = stripProtocolMarkers(input);

    expect(result).toContain("Hello");
    expect(result).toContain("World");
    expect(result).not.toContain("<|channel|>");
  });

  it("should handle the exact examples from the issue", () => {
    const tauri = `<|channel|>commentary to=repo_browser.apply_patch code<|message|>{"patch":"*** Begin Patch\\n*** Update File"}`;
    expect(stripProtocolMarkers(tauri)).toBe("");

    const web = `{"patch":"*** Begin Patch\\n*** Add File"}`;
    expect(stripProtocolMarkers(web)).toBe("");
  });
});
