import { describe, expect, it } from "vitest";

import { buildHandoff } from "../src/handoff";

describe("buildHandoff", () => {
  it("renders a handoff only when the owner user id is mentioned", () => {
    const result = buildHandoff({
      event: {
        channel: "C123",
        text: "please help <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toEqual({
      channel: "C123",
      text: "<@UR5BOT> 이 작업 처리해라.",
      threadTs: "1710000000.000100",
    });
  });

  it("ignores messages without the owner mention", () => {
    const result = buildHandoff({
      event: {
        channel: "C123",
        text: "please help UOWNER",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("ignores bot message subtypes", () => {
    const result = buildHandoff({
      event: {
        bot_id: "B123",
        channel: "C123",
        subtype: "bot_message",
        text: "please help <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
      },
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("uses an existing Slack thread timestamp when present", () => {
    const result = buildHandoff({
      event: {
        channel: "C123",
        text: "<@UOWNER> follow up",
        thread_ts: "1700000000.000001",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result?.threadTs).toBe("1700000000.000001");
  });

  it("renders a custom handoff template", () => {
    const result = buildHandoff({
      event: {
        channel: "C123",
        text: "<@UOWNER> custom",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      handoffMessageTemplate: "{target} 처리 부탁.",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result?.text).toBe("<@UR5BOT> 처리 부탁.");
  });
});
