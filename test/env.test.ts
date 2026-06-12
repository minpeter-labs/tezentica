import { describe, expect, it } from "vitest";

import { parseWorkerEnv } from "../src/config";

describe("parseWorkerEnv", () => {
  it("rejects missing Slack signing secret", () => {
    // Given: a Worker environment without the Slack signing secret.
    const env = {
      OWNER_USER_ID: "UOWNER123",
      SLACK_BOT_TOKEN: "xoxb-test",
      TARGET_BOT_USER_ID: "UTARGET456",
    };

    // When: the boundary parser receives the incomplete environment.
    const result = parseWorkerEnv(env);

    // Then: the missing signing secret is reported as a typed failure.
    expect(result).toEqual({
      issues: ["SLACK_SIGNING_SECRET is required"],
      kind: "invalid",
    });
  });
});
