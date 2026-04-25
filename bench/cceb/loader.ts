/**
 * Fixture loader for CCEB. Reads `bench/cceb/fixtures/*.json`, validates the
 * shape, and returns a typed `Fixture[]`. We do NOT use Zod here — the
 * schema is small enough that a hand-rolled validator is clearer for
 * fixture authors (the error messages tell you exactly which field is
 * wrong on which file) and avoids dragging Zod into the dev runtime.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ConversationTurn, MemoryType } from "../../src/types.js";
import type { ExpectedMemory, Fixture } from "./types.js";

const VALID_TYPES: MemoryType[] = [
  "decision",
  "architecture",
  "convention",
  "todo",
  "issue",
];

class FixtureValidationError extends Error {
  constructor(file: string, msg: string) {
    super(`[${basename(file)}] ${msg}`);
    this.name = "FixtureValidationError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateExpected(file: string, raw: unknown, idx: number): ExpectedMemory {
  if (!isObject(raw)) {
    throw new FixtureValidationError(file, `expected[${idx}] is not an object`);
  }
  if (typeof raw.type !== "string" || !VALID_TYPES.includes(raw.type as MemoryType)) {
    throw new FixtureValidationError(
      file,
      `expected[${idx}].type must be one of ${VALID_TYPES.join("/")}, got ${JSON.stringify(raw.type)}`
    );
  }
  if (!Array.isArray(raw.must_contain) || raw.must_contain.some((n) => typeof n !== "string")) {
    throw new FixtureValidationError(
      file,
      `expected[${idx}].must_contain must be a non-empty string[]`
    );
  }
  if (raw.must_contain.length === 0) {
    throw new FixtureValidationError(
      file,
      `expected[${idx}].must_contain must contain at least one keyword (otherwise every memory matches)`
    );
  }
  if (raw.must_not_contain !== undefined) {
    if (
      !Array.isArray(raw.must_not_contain) ||
      raw.must_not_contain.some((n) => typeof n !== "string")
    ) {
      throw new FixtureValidationError(
        file,
        `expected[${idx}].must_not_contain must be a string[] when set`
      );
    }
  }
  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    type: raw.type as MemoryType,
    must_contain: raw.must_contain as string[],
    must_not_contain:
      raw.must_not_contain === undefined
        ? undefined
        : (raw.must_not_contain as string[]),
    note: typeof raw.note === "string" ? raw.note : undefined,
  };
}

function validateTurn(file: string, raw: unknown, idx: number): ConversationTurn {
  if (!isObject(raw)) {
    throw new FixtureValidationError(file, `conversation.turns[${idx}] is not an object`);
  }
  if (raw.role !== "user" && raw.role !== "assistant") {
    throw new FixtureValidationError(
      file,
      `conversation.turns[${idx}].role must be "user" or "assistant"`
    );
  }
  if (typeof raw.text !== "string") {
    throw new FixtureValidationError(
      file,
      `conversation.turns[${idx}].text must be a string`
    );
  }
  return { role: raw.role, text: raw.text };
}

function validateFixture(file: string, raw: unknown): Fixture {
  if (!isObject(raw)) {
    throw new FixtureValidationError(file, "root must be an object");
  }
  if (typeof raw.id !== "string" || !raw.id) {
    throw new FixtureValidationError(file, "id must be a non-empty string");
  }
  if (typeof raw.description !== "string" || !raw.description) {
    throw new FixtureValidationError(file, "description must be a non-empty string");
  }
  if (!isObject(raw.conversation)) {
    throw new FixtureValidationError(file, "conversation must be an object");
  }
  if (typeof raw.conversation.title !== "string") {
    throw new FixtureValidationError(file, "conversation.title must be a string");
  }
  if (!Array.isArray(raw.conversation.turns) || raw.conversation.turns.length === 0) {
    throw new FixtureValidationError(file, "conversation.turns must be a non-empty array");
  }
  const turns = raw.conversation.turns.map((t, i) => validateTurn(file, t, i));

  if (!Array.isArray(raw.expected)) {
    throw new FixtureValidationError(file, "expected must be an array (use [] for noise fixtures)");
  }
  const expected = raw.expected.map((e, i) => validateExpected(file, e, i));

  return {
    id: raw.id,
    description: raw.description,
    difficulty:
      raw.difficulty === "easy" || raw.difficulty === "medium" || raw.difficulty === "hard"
        ? raw.difficulty
        : undefined,
    tags: Array.isArray(raw.tags) && raw.tags.every((t) => typeof t === "string")
      ? (raw.tags as string[])
      : undefined,
    conversation: { title: raw.conversation.title, turns },
    expected,
  };
}

export async function loadFixtures(dir: string): Promise<Fixture[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    throw new Error(`CCEB: cannot read fixtures dir at ${dir}: ${(err as Error).message}`);
  }
  if (files.length === 0) {
    throw new Error(`CCEB: no fixtures found under ${dir}`);
  }
  const fixtures: Fixture[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const full = join(dir, f);
    const raw = JSON.parse(await readFile(full, "utf-8"));
    const fixture = validateFixture(full, raw);
    if (seen.has(fixture.id)) {
      throw new FixtureValidationError(full, `duplicate fixture id "${fixture.id}"`);
    }
    seen.add(fixture.id);
    fixtures.push(fixture);
  }
  return fixtures;
}
