import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExtractionState, ConversationState } from "../types.js";

const STATE_PATH = ".ai-memory/.state.json";

const DEFAULT_STATE: ExtractionState = {
  lastExtraction: 0,
  processedConversations: {},
};

export async function loadState(): Promise<ExtractionState> {
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// --- Write mutex: serialise all saveState calls to prevent lost updates ---

let writeLock: Promise<void> = Promise.resolve();

export async function saveState(state: ExtractionState): Promise<void> {
  // Chain onto the previous write so concurrent callers are serialised
  writeLock = writeLock.then(async () => {
    await mkdir(dirname(STATE_PATH), { recursive: true });
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
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
