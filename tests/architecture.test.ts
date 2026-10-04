// Enforces the hexagonal import direction: infra -> use cases -> domain, never outward.
import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "supabase/functions/_shared";
const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
const filesIn = (dir: string) => !existsSync(join(root, dir)) ? [] : readdirSync(join(root, dir)).filter((f) => f.endsWith(".ts")).map((f) => join(root, dir, f));

test("domain imports only domain", () => {
  for (const f of filesIn("domain")) {
    for (const spec of importsOf(f)) assert.match(spec, /^\.\/[\w-]+\.ts$/, `${f} imports ${spec}`);
  }
});

test("use cases import only domain (and sibling use cases)", () => {
  for (const f of filesIn("use-cases")) {
    for (const spec of importsOf(f)) assert.match(spec, /^(\.\.\/domain\/|\.\/)[\w-]+\.ts$/, `${f} imports ${spec}`);
    assert.doesNotMatch(readFileSync(f, "utf8"), /\bDeno\./, `${f} uses Deno APIs`);
  }
});
