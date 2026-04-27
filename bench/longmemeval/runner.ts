/**
 * LongMemEval-50 runner. Glue between selected samples and the real
 * extractMemories() pipeline. Mirrors `bench/cceb/runner.ts` so a
 * reader who knows CCEB doesn't have to learn a second shape.
 */

import type {
  CliOptions,
  Conversation,
  ExtractedMemory,
} from "../../src/types.js";
import { extractMemories } from "../../src/extractor/ai-extractor.js";
import {
  haystackToConversationTurns,
  scoreEvidencePreserved,
  answerToKeyTokens,
} from "./adapter.js";
import type {
  LongMemEvalSample,
  LongMemEvalType,
  QuestionScore,
} from "./types.js";

export interface RunOptions {
  /** When true, skip LLM calls and treat extraction as []. CI smoke. */
  dryRun: boolean;
  model?: string;
  onProgress?: (info: {
    index: number;
    total: number;
    sample: LongMemEvalSample;
    score: QuestionScore;
  }) => void;
}

function sampleToConversation(sample: LongMemEvalSample): Conversation {
  const turns = haystackToConversationTurns(sample.haystack_sessions, sample.haystack_dates);
  return {
    meta: {
      id: `lme-${sample.question_id}`,
      source: "cursor",
      filePath: `<longmemeval>/${sample.question_id}`,
      title: `LongMemEval ${sample.question_type} — ${sample.question_id}`,
      modifiedAt: Date.UTC(2026, 3, 27, 0, 0, 0),
      turnCount: turns.length,
    },
    turns,
  };
}

async function runOneSample(
  sample: LongMemEvalSample,
  opts: RunOptions,
): Promise<QuestionScore> {
  const tokens = answerToKeyTokens(sample.answer);
  const conv = sampleToConversation(sample);
  const sessionTurnCount = conv.turns.length;

  if (opts.dryRun) {
    return {
      question_id: sample.question_id,
      question_type: sample.question_type as LongMemEvalType,
      session_turn_count: sessionTurnCount,
      extracted_count: 0,
      answer_key_tokens: tokens,
      matched_tokens: [],
      missed_tokens: tokens,
      full_evidence: false,
      partial_evidence: false,
      latency_ms: 0,
    };
  }

  const cliOpts: CliOptions = {
    command: "extract",
    types: ["decision", "architecture", "convention", "todo", "issue"],
    verbose: false,
  };
  const start = performance.now();
  let memories: ExtractedMemory[] = [];
  let error: string | undefined;
  try {
    const result = await extractMemories(conv, cliOpts, 0, opts.model);
    memories = result.memories;
  } catch (err) {
    error = (err as Error).message ?? String(err);
  }
  const latency_ms = performance.now() - start;
  const ev = scoreEvidencePreserved(sample.answer, memories);
  return {
    question_id: sample.question_id,
    question_type: sample.question_type as LongMemEvalType,
    session_turn_count: sessionTurnCount,
    extracted_count: memories.length,
    answer_key_tokens: tokens,
    matched_tokens: ev.matched,
    missed_tokens: ev.missed,
    full_evidence: ev.full,
    partial_evidence: ev.partial,
    latency_ms,
    error,
  };
}

/**
 * Run all samples sequentially. Same rationale as CCEB: stay polite to
 * rate-limited endpoints and keep per-sample latency interpretable.
 */
export async function runAllSamples(
  samples: LongMemEvalSample[],
  opts: RunOptions,
): Promise<QuestionScore[]> {
  const out: QuestionScore[] = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const score = await runOneSample(sample, opts);
    out.push(score);
    opts.onProgress?.({ index: i, total: samples.length, sample, score });
  }
  return out;
}
