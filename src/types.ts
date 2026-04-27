// --- Data Source Types ---

export type SourceType = "cursor" | "claude-code" | "windsurf" | "copilot" | "codex";

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

// --- Memory ↔ Commit linking (v2.6) ---

export interface ImplementationLink {
  /** Full 40-char SHA. */
  sha: string;
  /** Short SHA (cached for display). */
  short: string;
  /** Repo-relative paths the commit touched that matched the memory's tokens. */
  paths: string[];
  /** Commit subject. */
  subject: string;
  /** Commit author name. */
  author: string;
  /** Commit author date (ISO 8601). */
  date: string;
  /** Similarity algorithm used. */
  method: "jaccard";
  /** Weighted Jaccard score (0–1). */
  score: number;
  /** How the link was established. */
  confirmed_by: "auto" | "manual";
  /** ISO 8601 timestamp of when the link was first recorded. */
  first_linked: string;
}

export interface MemoryLinks {
  implementations: ImplementationLink[];
}

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
  /** Author who extracted this memory (team mode) */
  author?: string;
  /** Memory status: active (default) or resolved */
  status?: "active" | "resolved";
  /** File path on disk (populated when reading) */
  filePath?: string;
  /** Implementation commit links (v2.6+). Populated by `ai-memory link`. */
  links?: MemoryLinks;
}

// --- CLI Types ---

export interface CliOptions {
  command: "extract" | "summary" | "context" | "init" | "list" | "search" | "recall" | "rules" | "resolve" | "serve" | "reindex" | "watch" | "dashboard" | "export" | "import" | "doctor" | "try" | "link" | "help" | "version";
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
  /** Overwrite existing memory files even if they already exist */
  force?: boolean;
  /** Undo a resolve (reactivate memories) */
  undo?: boolean;
  /** Override auto-detected author name */
  author?: string;
  /** Include all authors' memories (summary/context) */
  allAuthors?: boolean;
  /** Search query string */
  query?: string;
  /** Include resolved/completed memories */
  includeResolved?: boolean;
  /** Positional args (e.g. file paths for resolve) */
  positionalArgs?: string[];
  /** MCP server debug mode */
  debug?: boolean;
  /** Dashboard server port */
  port?: number;
  /** Run quality dedup/cleanup on existing memories (reindex command) */
  dedup?: boolean;
  /** Filter context/summary by conversation ID (prefix match, like git short hash) */
  sourceId?: string;
  /** Filter context/summary by conversation title substring */
  convo?: string;
  /** List all conversations that produced memories, grouped by sourceId */
  listSources?: boolean;
  /** When --convo matches multiple conversations, include all (default: most recent only) */
  allMatching?: boolean;
  /** Bundle file path for export (--output) / import (positional or --file) */
  bundle?: string;
  /** Overwrite existing memory files on import (default: skip) */
  overwrite?: boolean;
  /** Skip live LLM connectivity test in `doctor` (useful for CI / offline runs) */
  noLlmCheck?: boolean;
  /** Write `.cursor/mcp.json` + `.windsurf/mcp.json` during `init` (v2.4+) */
  withMcp?: boolean;
  /** Output target for `rules` command (v2.4+ adds agents-md/both; v2.5-04 adds skills). Default: cursor-rules. */
  target?: "cursor-rules" | "agents-md" | "skills" | "both";
  /** Keep the bundled-scenario tmp dir after `try` instead of deleting (v2.5+). */
  keep?: boolean;
  /**
   * Enable redaction of secrets / PII / internal hostnames before sending
   * conversation text to the LLM (extract / summary / context --summarize).
   * Default OFF in v2.5 (additive, opt-in). When undefined, falls back to
   * `config.redact.enabled` (also `false` by default).
   * See `docs/redaction-policy-2026-04-26.md` for the threat model + rule list.
   */
  redact?: boolean;
  /** Explicit `--no-redact` overrides any config-level enable. */
  noRedact?: boolean;
  /**
   * Register a daily `extract --incremental` cron/launchd/schtasks job for the
   * current project directory. macOS → launchd, Linux → crontab, Windows → schtasks.
   */
  schedule?: boolean;
  /** Remove the scheduled task previously created by `init --schedule`. */
  unschedule?: boolean;
  /**
   * For `link` command: only scan commits from the last N days (or any git
   * --since string, e.g. "7 days ago"). Default: "30 days ago".
   */
  linkSince?: string;
  /** For `link` command: remove all auto-linked entries from every memory file. */
  clearAuto?: boolean;
  /** For `link` command: override the auto-link score threshold (0–1). */
  autoThreshold?: number;
  /** For `link` command: maximum commits to scan. Default 200. */
  maxCommits?: number;
}

// --- Memory Bundle (export/import) ---

export const BUNDLE_VERSION = 1;

export interface BundleMemory {
  type: MemoryType;
  title: string;
  date: string;
  context?: string;
  content: string;
  reasoning?: string;
  alternatives?: string;
  impact?: string;
  sourceId: string;
  sourceTitle?: string;
  sourceType: SourceType;
  author?: string;
  status?: "active" | "resolved";
}

export interface MemoryBundle {
  /** Schema version — increment on breaking changes */
  version: typeof BUNDLE_VERSION;
  /** ISO timestamp */
  exportedAt: string;
  /** Total memory count (quick peek before parsing entries) */
  memoryCount: number;
  /** Tool name + version that produced this bundle */
  producer: string;
  /** Author name on the source machine (informational; can be remapped on import) */
  exportedBy?: string;
  /** Optional filter description (e.g. "sourceId=b56 convo=resume") */
  scope?: string;
  /** Actual memory entries */
  memories: BundleMemory[];
}

// --- Config Types ---

/**
 * Per-rule redaction descriptor in `.ai-memory/.config.json`.
 *
 * `pattern` is a RegExp source string (NOT a literal-match string —
 * fed to `new RegExp(pattern, "g")` at config load). The `g` flag is
 * always added by us; users should NOT include flags in `pattern`.
 *
 * The `replacement` defaults to `<REDACTED:${name}>` if omitted. When
 * `group: 1` is set, only capture group 1 is replaced (useful for
 * patterns that need a lookbehind anchor visible in the regex but
 * shouldn't be redacted, e.g. internal-hostname).
 */
export interface RedactRuleSpec {
  name: string;
  pattern: string;
  replacement?: string;
  group?: 1;
}

/**
 * Redaction config block. See `docs/redaction-policy-2026-04-26.md`
 * for the full threat model and the locked default rule list.
 */
export interface RedactConfig {
  /** Master switch. CLI `--redact` / `--no-redact` overrides this. */
  enabled?: boolean;
  /** User-defined rules (validated at load; bad rules dropped with stderr warning). */
  rules?: RedactRuleSpec[];
  /** When false, user `rules` REPLACE the defaults instead of augmenting them. Default true. */
  extendDefaults?: boolean;
  /** Names of opt-in default rules to turn on (e.g. "jwt", "aws-secret-key"). */
  enableOptional?: string[];
}

export interface AiMemoryConfig {
  sources: {
    cursor: { enabled: boolean; projectName?: string };
    claudeCode: { enabled: boolean };
    windsurf: { enabled: boolean };
    copilot: { enabled: boolean };
    codex: { enabled: boolean };
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
  /** Embedding model for semantic search (default: text-embedding-3-small) */
  embeddingModel?: string;
  /** Author name for team mode (auto-detected from git if not set) */
  author?: string;
  /** Redaction policy (v2.5-05+). When omitted, redaction is OFF. */
  redact?: RedactConfig;
}

export const DEFAULT_CONFIG: AiMemoryConfig = {
  sources: {
    cursor: { enabled: true },
    claudeCode: { enabled: true },
    windsurf: { enabled: true },
    copilot: { enabled: true },
    codex: { enabled: true },
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
