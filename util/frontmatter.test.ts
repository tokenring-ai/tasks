import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { FrontmatterError, parseFrontmatter, serializeFrontmatter, splitFrontmatter, writeMarkdownAtomic } from "./frontmatter.ts";

const TestSchema = z.looseObject({
  title: z.string().default(""),
  status: z.enum(["pending", "done"]).default("pending"),
  tags: z.array(z.string()).default([]),
});

describe("splitFrontmatter", () => {
  it("returns the whole document as body when there is no frontmatter", () => {
    const { yaml, body } = splitFrontmatter("# Heading\n\nSome prose.\n");
    expect(yaml).toBeNull();
    expect(body).toBe("# Heading\n\nSome prose.\n");
  });

  it("splits a well-formed document", () => {
    const { yaml, body } = splitFrontmatter("---\ntitle: Hello\n---\n\nBody text\n");
    expect(yaml).toBe("title: Hello");
    expect(body).toBe("Body text\n");
  });

  it("handles an empty frontmatter block", () => {
    const { yaml, body } = splitFrontmatter("---\n---\nBody\n");
    expect(yaml).toBe("");
    expect(body).toBe("Body\n");
  });

  it("treats an unterminated block as body rather than throwing", () => {
    const content = "---\ntitle: Hello\n\nNo closing delimiter.\n";
    const { yaml, body } = splitFrontmatter(content);
    expect(yaml).toBeNull();
    expect(body).toBe(content);
  });

  it("normalizes CRLF line endings", () => {
    const { yaml, body } = splitFrontmatter("---\r\ntitle: Hello\r\n---\r\n\r\nBody\r\n");
    expect(yaml).toBe("title: Hello");
    expect(body).toBe("Body\n");
  });

  it("strips a UTF-8 BOM before looking for the delimiter", () => {
    const { yaml } = splitFrontmatter("﻿---\ntitle: Hello\n---\n\nBody\n");
    expect(yaml).toBe("title: Hello");
  });

  it("does not treat a mid-body horizontal rule as a frontmatter opener", () => {
    const content = "Intro\n\n---\n\nAfter the rule\n";
    const { yaml, body } = splitFrontmatter(content);
    expect(yaml).toBeNull();
    expect(body).toBe(content);
  });

  it("does not close the block on an indented --- inside a nested value", () => {
    const content = "---\ntitle: Hello\nnote: |\n  ---\n  still inside the block\nstatus: done\n---\n\nBody\n";
    const { yaml, body } = splitFrontmatter(content);
    expect(yaml).toContain("status: done");
    expect(body).toBe("Body\n");
  });

  it("closes the block on a `...` end-of-document delimiter", () => {
    const { yaml, body } = splitFrontmatter("---\ntitle: Hello\n...\n\nBody\n");
    expect(yaml).toBe("title: Hello");
    expect(body).toBe("Body\n");
  });

  it("strips exactly one blank separator line, preserving further blanks", () => {
    const { body } = splitFrontmatter("---\ntitle: Hello\n---\n\n\nBody\n");
    expect(body).toBe("\nBody\n");
  });
});

describe("parseFrontmatter", () => {
  it("applies schema defaults when there is no frontmatter block", () => {
    const { data, hadFrontmatter, body } = parseFrontmatter("Just prose\n", TestSchema);
    expect(hadFrontmatter).toBe(false);
    expect(data.title).toBe("");
    expect(data.status).toBe("pending");
    expect(data.tags).toEqual([]);
    expect(body).toBe("Just prose\n");
  });

  it("applies schema defaults for an empty block", () => {
    const { data, hadFrontmatter } = parseFrontmatter("---\n---\nBody\n", TestSchema);
    expect(hadFrontmatter).toBe(true);
    expect(data.status).toBe("pending");
  });

  it("preserves unknown keys so user-authored fields survive a write-back", () => {
    const { data } = parseFrontmatter("---\ntitle: Hello\njira: ABC-123\n---\n\nBody\n", TestSchema);
    expect(data.title).toBe("Hello");
    expect((data as Record<string, unknown>).jira).toBe("ABC-123");
  });

  it("throws FrontmatterError when the root is not a mapping", () => {
    expect(() => parseFrontmatter("---\n- one\n- two\n---\n\nBody\n", TestSchema)).toThrow(FrontmatterError);
    expect(() => parseFrontmatter("---\njust a string\n---\n\nBody\n", TestSchema)).toThrow(FrontmatterError);
  });

  it("propagates schema validation failures", () => {
    expect(() => parseFrontmatter("---\nstatus: nonsense\n---\n\nBody\n", TestSchema)).toThrow();
  });
});

describe("serializeFrontmatter", () => {
  it("emits a delimited block followed by the body", () => {
    const output = serializeFrontmatter({ title: "Hello", status: "pending" }, "Body text");
    expect(output).toBe("---\ntitle: Hello\nstatus: pending\n---\n\nBody text\n");
  });

  it("preserves key insertion order", () => {
    const output = serializeFrontmatter({ zebra: 1, apple: 2, mango: 3 }, "Body");
    expect(output.indexOf("zebra")).toBeLessThan(output.indexOf("apple"));
    expect(output.indexOf("apple")).toBeLessThan(output.indexOf("mango"));
  });

  it("handles an empty body without leaving a trailing blank line", () => {
    expect(serializeFrontmatter({ title: "Hello" }, "")).toBe("---\ntitle: Hello\n---\n\n");
  });

  it("round-trips idempotently", () => {
    const original = serializeFrontmatter({ title: "Hello", status: "done", tags: ["a", "b"] }, "Body text\n\nMore text");
    const { data, body } = parseFrontmatter(original, TestSchema);
    expect(serializeFrontmatter(data, body)).toBe(original);
  });

  it("round-trips a document carrying unknown keys", () => {
    const original = "---\ntitle: Hello\nstatus: pending\ntags: []\njira: ABC-123\n---\n\nBody\n";
    const { data, body } = parseFrontmatter(original, TestSchema);
    const reserialized = serializeFrontmatter(data, body);
    expect(reserialized).toContain("jira: ABC-123");
    const second = parseFrontmatter(reserialized, TestSchema);
    expect(serializeFrontmatter(second.data, second.body)).toBe(reserialized);
  });
});

describe("writeMarkdownAtomic", () => {
  it("creates parent directories and leaves no temp files behind", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-frontmatter-"));
    try {
      const filePath = path.join(dir, "nested", "deeper", "task.md");
      await writeMarkdownAtomic(filePath, { title: "Hello", status: "pending" }, "Body text");

      expect(await fs.readFile(filePath, "utf-8")).toBe("---\ntitle: Hello\nstatus: pending\n---\n\nBody text\n");
      expect((await fs.readdir(path.dirname(filePath))).filter(entry => entry.endsWith(".tmp"))).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("overwrites an existing file in place", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-frontmatter-"));
    try {
      const filePath = path.join(dir, "task.md");
      await writeMarkdownAtomic(filePath, { title: "First" }, "One");
      await writeMarkdownAtomic(filePath, { title: "Second" }, "Two");

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("title: Second");
      expect(content).toContain("Two");
      expect(content).not.toContain("First");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("YAML tidying", () => {
  it("does not leave trailing whitespace on any line", () => {
    const output = serializeFrontmatter({ title: "Hello", tags: ["a"], steps: [] }, "Body");
    for (const line of output.split("\n")) {
      expect(line).toBe(line.replace(/[ \t]+$/, ""));
    }
  });

  it("keeps empty collections on the same line as their key", () => {
    const output = serializeFrontmatter({ steps: [], meta: {} }, "Body");
    expect(output).toContain("steps: []");
    expect(output).toContain("meta: {}");
  });

  it("still round-trips after tidying", () => {
    const schema = z.looseObject({ tags: z.array(z.string()).default([]), steps: z.array(z.string()).default([]) });
    const original = serializeFrontmatter({ tags: ["a", "b"], steps: [] }, "Body");
    const { data, body } = parseFrontmatter(original, schema);

    expect(data.tags).toEqual(["a", "b"]);
    expect(data.steps).toEqual([]);
    expect(serializeFrontmatter(data, body)).toBe(original);
  });

  it("leaves non-empty nested collections untouched", () => {
    const output = serializeFrontmatter({ tags: ["one", "two"] }, "Body");
    expect(output).toContain("- one");
    expect(output).toContain("- two");
  });
});
