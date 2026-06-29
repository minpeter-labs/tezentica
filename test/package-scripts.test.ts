import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const packageJsonSchema = z.object({
  scripts: z.record(z.string(), z.string()),
});

const devScriptName = "dev";

describe("package scripts", () => {
  it("keeps deploy scripts focused on the deployed Slack webhook", () => {
    const packageJson = packageJsonSchema.parse(
      JSON.parse(readFileSync("package.json", "utf8"))
    );

    expect(packageJson.scripts).toMatchObject({
      check: "biome check . && tsc -p tsconfig.json --noEmit && vitest run",
      ship: "run-s ship:secrets ship:worker && pnpm run ship:webhook --",
      "ship:secrets": "wrangler secret bulk .dev.vars",
      "ship:webhook": "tsx scripts/slack.ts webhook",
      "ship:worker": "wrangler deploy",
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json --noEmit",
    });
    expect(packageJson.scripts[devScriptName]).toBeUndefined();
    expect(packageJson.scripts["dev:relay"]).toBeUndefined();
    expect(packageJson.scripts["dev:tunnel"]).toBeUndefined();
    expect(packageJson.scripts["dev:worker"]).toBeUndefined();
  });
});
