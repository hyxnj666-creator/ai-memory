// --- Data Source Types ---

export type SourceType = "cursor" | "claude-code";

export interface ConversationMeta {
  id: string;
  source: SourceType;
  filePath: string;
  /** Conversation title (extracted from first user message or folder name) */
  title: string;
  /** Last modified timestamp (from file system) */
  modifiedAt: number;
  /** Number of turns in the conversation */
  turnCount: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface Conversation {
  meta: ConversationMeta;
  turns: ConversationTurn[];
}

// --- Extracted Memory Types ---

export type MemoryType =
  | "decision"
  | "architecture"
  | "convention"
  | "todo"
  | "issue";

export interface ExtractedMemory {
  type: MemoryType;
  title: string;
  date: string;
  context: string;
  content: string;
  reasoning?: string;
  alternatives?: string;
  impact?: string;
  /** Source conversation reference */
  sourceId: string;
  sourceTitle: string;
  sourceType: SourceType;
}

// --- CLI Types ---

export interface CliOptions {
  command: "extract" | "summary" | "context" | "init" | "list" | "help" | "version";
  source?: SourceType;
  since?: string;
  incremental?: boolean;
  types?: MemoryType[];
  topic?: string;
  recent?: number;
  copy?: boolean;
  output?: string;
  focus?: string;
  json?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  /** Comma-separated 1-based indices to process, e.g. "3" or "1,4,7" */
  pick?: string;
  /** ID prefix to match a specific conversation */
  pickId?: string;
  /** Use LLM to generate a summarized context (context command) */
  summarize?: boolean;
}

// --- Config Types ---

export interface AiMemoryConfig {
  sources: {
    cursor: { enabled: boolean; projectName?: string };
    claudeCode: { enabled: boolean };
  };
  extract: {
    types: MemoryType[];
    ignoreConversations: string[];
    minConversationLength: number;
  };
  output: {
    dir: string;
    summaryFile: string;
    language: "zh" | "en";
  };
  model: string;
}

export const DEFAULT_CONFIG: AiMemoryConfig = {
  sources: {
    cursor: { enabled: true },
    claudeCode: { enabled: true },
  },
  extract: {
    types: ["decision", "architecture", "convention", "todo", "issue"],
    ignoreConversations: [],
    minConversationLength: 5,
  },
  output: {
    dir: ".ai-memory",
    summaryFile: "SUMMARY.md",
    language: "zh",
  },
  model: "",
};

// --- Source Interface ---

export interface Source {
  type: SourceType;
  /** Check if this source is available on this machine */
  detect(): Promise<boolean>;
  /** List all conversations */
  listConversations(): Promise<ConversationMeta[]>;
  /** Load full conversation content */
  loadConversation(meta: ConversationMeta): Promise<Conversation>;
}

// --- Extraction State ---

export interface ConversationState {
  /** Timestamp when this conversation was last processed */
  processedAt: number;
  /** How many turns were in the conversation when last processed */
  turnCount: number;
}

export interface ExtractionState {
  lastExtraction: number;
  /** id -> state (supports both legacy number and new object format) */
  processedConversations: Record<string, ConversationState | number>;
}

export function getConversationState(
  state: ExtractionState,
  id: string
): ConversationState | null {
  const v = state.processedConversations[id];
  if (!v) return null;
  if (typeof v === "number") return { processedAt: v, turnCount: 0 };
  return v;
}
