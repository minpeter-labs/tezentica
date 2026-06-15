import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const durableObjectBindingSchema = z.object({
  class_name: z.string(),
  name: z.string(),
});

const durableObjectMigrationSchema = z.object({
  new_sqlite_classes: z.array(z.string()).optional(),
  tag: z.string(),
});

const wranglerConfigSchema = z.object({
  durable_objects: z.object({
    bindings: z.array(durableObjectBindingSchema),
  }),
  migrations: z.array(durableObjectMigrationSchema),
  name: z.string(),
});

describe("wrangler config", () => {
  it("declares durable object dedupe binding", () => {
    const config = wranglerConfigSchema.parse(
      JSON.parse(readFileSync("wrangler.jsonc", "utf8"))
    );

    expect(config.name).toBe("tezentica");
    expect(config.durable_objects.bindings).toContainEqual({
      class_name: "MessageDedupeObject",
      name: "MESSAGE_DEDUPE",
    });
    expect(config.migrations).toContainEqual({
      new_sqlite_classes: ["MessageDedupeObject"],
      tag: "v1",
    });
  });
});
