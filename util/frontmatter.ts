import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { YAML } from "bun";
import type { z } from "zod";

/**
 * Thrown when a frontmatter block is present but cannot be turned into an object.
 *
 * Callers that scan directories catch this and skip the offending file, so one
 * malformed task cannot hide every other task in the same list.
 */
export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterError";
  }
}

/** Matches a delimiter line — `---` or the YAML end-of-document `...` — plus trailing blanks. */
const DELIMITER = /^(---|\.\.\.)[ \t]*$/;

/** Strips a UTF-8 BOM and normalizes CRLF so line handling below can assume `\n`. */
function normalize(content: string): string {
  return content.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

/**
 * Splits a markdown document into its raw frontmatter YAML and its body.
 *
 * `yaml` is null when there is no frontmatter block, which covers both a plain markdown
 * file and one that merely opens with a horizontal rule. An unterminated block is treated
 * the same way rather than raising: a task file is a user-authored document, and refusing
 * to list a whole directory because one file starts with `---` would be worse than
 * treating that `---` as prose.
 */
export function splitFrontmatter(content: string): { yaml: string | null; body: string } {
  const normalized = normalize(content);
  const lines = normalized.split("\n");

  if (lines[0] !== "---") return { yaml: null, body: normalized };

  // Deliberately matched against the raw line: trimming first would let an indented `---`
  // inside a nested YAML value close the block early.
  const endIndex = lines.findIndex((line, index) => index > 0 && DELIMITER.test(line));
  if (endIndex === -1) return { yaml: null, body: normalized };

  const yaml = lines.slice(1, endIndex).join("\n");
  // Drop exactly one blank separator line. Trimming the whole body would destroy round-trip
  // fidelity and turn every status write-back into a noisy diff.
  const body = lines
    .slice(endIndex + 1)
    .join("\n")
    .replace(/^\n/, "");

  return { yaml, body };
}

/**
 * Splits a document and validates its frontmatter against `schema`.
 *
 * A file with no frontmatter still parses: the schema is applied to `{}` so its defaults
 * fill in. That is what lets a hand-written `.md` with nothing but prose be a valid task.
 */
export function parseFrontmatter<S extends z.ZodType>(content: string, schema: S): { data: z.output<S>; body: string; hadFrontmatter: boolean } {
  const { yaml, body } = splitFrontmatter(content);
  if (yaml === null) {
    return { data: schema.parse({}) as z.output<S>, body, hadFrontmatter: false };
  }

  let raw: unknown;
  try {
    raw = YAML.parse(yaml);
  } catch (error) {
    throw new FrontmatterError(`Invalid YAML in frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (raw != null && (typeof raw !== "object" || Array.isArray(raw))) {
    throw new FrontmatterError(`Frontmatter must be a mapping, got ${Array.isArray(raw) ? "an array" : typeof raw}`);
  }

  return { data: schema.parse(raw ?? {}) as z.output<S>, body, hadFrontmatter: true };
}

/**
 * Renders `data` and `body` back into a markdown document.
 *
 * `YAML.stringify` emits keys in insertion order, so callers must build `data` through a
 * single ordering helper — otherwise every write reshuffles the block and every task file
 * shows up in `git diff`.
 */
export function serializeFrontmatter(data: unknown, body: string): string {
  const yaml = tidyYaml(YAML.stringify(data, null, 2)).trimEnd();
  const trimmedBody = body.replace(/^\n+/, "").trimEnd();
  return `---\n${yaml}\n---\n\n${trimmedBody}${trimmedBody ? "\n" : ""}`;
}

/**
 * Cosmetic cleanup of Bun's block-style YAML, which leaves a trailing space after every mapping
 * key and pushes empty collections onto their own line (`steps: \n  []`).
 *
 * These files are meant to be read and edited by hand, so the noise is worth removing. Both
 * transforms are whitespace-only and parse back identically.
 */
function tidyYaml(yaml: string): string {
  return yaml.replace(/[ \t]+$/gm, "").replace(/^([^\n:]*:)\n[ \t]+(\[\]|\{\})$/gm, "$1 $2");
}

/**
 * Writes a markdown document with frontmatter via a temp file + rename, so a crash never
 * leaves a half-written task behind.
 *
 * This exists because `writeYamlAtomic` from `@tokenring-ai/app` stringifies the entire value
 * as YAML and can only prepend a comment header — it structurally cannot emit a frontmatter
 * block followed by a markdown body. The temp name also carries a uuid, where `writeYamlAtomic`
 * uses a fixed `.tmp` suffix that two concurrent writers to the same path would clobber.
 */
export async function writeMarkdownAtomic(filePath: string, data: unknown, body: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpFile, serializeFrontmatter(data, body), "utf-8");
    await fs.rename(tmpFile, filePath);
  } catch (error) {
    await fs.unlink(tmpFile).catch(() => {});
    throw error;
  }
}
