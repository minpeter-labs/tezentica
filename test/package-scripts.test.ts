import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const packageJsonSchema = z.object({
  scripts: z.record(z.string(), z.string()),
});

describe("package scripts", () => {
  it("keeps template dev and ship ergonomics with Slack tunnel semantics", () => {
    const packageJson = packageJsonSchema.parse(JSON.parse(readFileSync("package.json", "utf8")));

    expect(packageJson.scripts).toMatchObject({
      check: "biome check . && tsc -p tsconfig.json --noEmit && vitest run",
      dev: "run-p dev:worker dev:tunnel",
      "dev:tunnel": "tsx scripts/slack.ts tunnel",
      "dev:worker": "wrangler dev",
      ship: "run-s ship:secrets ship:worker ship:webhook",
      "ship:secrets": "wrangler secret bulk .dev.vars",
      "ship:webhook": "tsx scripts/slack.ts webhook",
      "ship:worker": "wrangler deploy",
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json --noEmit",
    });
    expect(packageJson.scripts["dev:relay"]).toBeUndefined();
  });
});
