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

  it("parses optional alert channel ids from comma-separated env", () => {
    // Given: a Worker environment with alert channels configured.
    const env = {
      ALERT_CHANNEL_IDS: "CALERT, CSECOND ,,",
      OWNER_USER_ID: "UOWNER123",
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_BOT_USER_ID: "UTEZENTICA",
      SLACK_SIGNING_SECRET: "secret",
      TARGET_BOT_USER_ID: "UTARGET456",
    };

    // When: the boundary parser receives the environment.
    const result = parseWorkerEnv(env);

    // Then: empty entries are removed and alert channel IDs are typed as a list.
    expect(result).toEqual({
      config: {
        ALERT_CHANNEL_IDS: ["CALERT", "CSECOND"],
        OWNER_USER_ID: "UOWNER123",
        SLACK_BOT_TOKEN: "xoxb-test",
        SLACK_BOT_USER_ID: "UTEZENTICA",
        SLACK_SIGNING_SECRET: "secret",
        TARGET_BOT_USER_ID: "UTARGET456",
      },
      kind: "valid",
    });
  });
});
