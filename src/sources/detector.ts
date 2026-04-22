import type { Source, SourceType } from "../types.js";
import { CursorSource } from "./cursor.js";
import { ClaudeCodeSource } from "./claude-code.js";
import { WindsurfSource } from "./windsurf.js";
import { CopilotSource } from "./copilot.js";

interface DetectionResult {
  available: Source[];
  unavailable: SourceType[];
}

export async function detectSources(
  projectName?: string
): Promise<DetectionResult> {
  const candidates: Source[] = [
    new CursorSource(projectName),
    new ClaudeCodeSource(),
    new WindsurfSource(),
    new CopilotSource(),
  ];

  const available: Source[] = [];
  const unavailable: SourceType[] = [];

  for (const source of candidates) {
    const ok = await source.detect();
    if (ok) {
      available.push(source);
    } else {
      unavailable.push(source.type);
    }
  }

  return { available, unavailable };
}

export function createSource(
  type: SourceType,
  projectName?: string
): Source {
  switch (type) {
    case "cursor":
      return new CursorSource(projectName);
    case "claude-code":
      return new ClaudeCodeSource();
    case "windsurf":
      return new WindsurfSource();
    case "copilot":
      return new CopilotSource();
    default:
      throw new Error(`Source type "${type}" is not yet supported`);
  }
}

const SOURCE_LABELS: Record<SourceType, string> = {
  cursor: "Cursor",
  "claude-code": "Claude Code",
  windsurf: "Windsurf",
  copilot: "VS Code Copilot",
};

export function sourceLabel(type: SourceType): string {
  return SOURCE_LABELS[type] ?? type;
}
