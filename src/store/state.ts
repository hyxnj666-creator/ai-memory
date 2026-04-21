import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ExtractionState, ConversationState } from "../types.js";

const DEFAULT_STATE: ExtractionState = {
  lastExtraction: 0,
  processedConversations: {},
};

function statePath(outputDir?: string): string {
  return join(outputDir || ".ai-memory", ".state.json");
}

export async function loadState(outputDir?: string): Promise<ExtractionState> {
  try {
    const raw = await readFile(statePath(outputDir), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_STATE };
    return {
      ...DEFAULT_STATE,
      ...parsed,
      processedConversations:
        parsed.processedConversations && typeof parsed.processedConversations === "object"
          ? parsed.processedConversations
          : {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// --- Write mutex: serialise all saveState calls to prevent lost updates ---

let writeLock: Promise<void> = Promise.resolve();

export async function saveState(state: ExtractionState, outputDir?: string): Promise<void> {
  const path = statePath(outputDir);
  writeLock = writeLock.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
  });
  return writeLock;
}

export function markProcessed(
  state: ExtractionState,
  id: string,
  turnCount: number
): void {
  const entry: ConversationState = {
    processedAt: Date.now(),
    turnCount,
  };
  state.processedConversations[id] = entry;
  state.lastExtraction = Date.now();
}
