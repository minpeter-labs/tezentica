import { describe, expect, it } from "vitest";

import {
  buildHandoff,
  composeHandoffMessage,
  type Handoff,
} from "../src/handoff";

describe("buildHandoff", () => {
  it("routes an owner mention to the home channel with the origin preserved", () => {
    const result = buildHandoff({
      event: {
        channel: "C123",
        text: "please help <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toEqual({
      destinationChannel: "CHOME",
      originChannel: "C123",
      originThreadTs: "1710000000.000100",
      ruleId: "owner-mention",
      text: "<@UR5BOT> 이 작업 처리하고 원본 스레드에 오너 자격으로 답해줘.\n원본 메시지:\n```please help <@UOWNER>```",
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
      homeChannelId: "CHOME",
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
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("ignores events that originate in the home channel", () => {
    const result = buildHandoff({
      event: {
        channel: "CHOME",
        text: "please help <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("ignores messages authored by the owner to break the handoff loop", () => {
    // This is what the target agent posts "as the owner" into the original
    // thread; honoring it would re-trigger the owner-mention rule forever.
    const result = buildHandoff({
      event: {
        channel: "C123",
        text: "<@UOWNER> 확인했습니다",
        ts: "1710000000.000100",
        type: "message",
        user: "UOWNER",
      },
      homeChannelId: "CHOME",
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
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result?.originThreadTs).toBe("1700000000.000001");
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
      handoffMessageTemplate: "{target} 처리 부탁.\n원문: {message}",
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result?.text).toBe("<@UR5BOT> 처리 부탁.\n원문: <@UOWNER> custom");
  });

  it("keeps Slack code fences closed when the original message contains backticks", () => {
    const result = buildHandoff({
      event: {
        channel: "C123",
        text: "<@UOWNER> use ```danger```",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result?.text).toBe(
      "<@UR5BOT> 이 작업 처리하고 원본 스레드에 오너 자격으로 답해줘.\n원본 메시지:\n```<@UOWNER> use `​``danger`​`````"
    );
  });

  it("renders alert channel severity analysis handoffs for bot messages", () => {
    const result = buildHandoff({
      alertChannelIds: ["CALERT"],
      event: {
        bot_id: "BALERT",
        channel: "CALERT",
        subtype: "bot_message",
        text: "[critical] API latency high",
        ts: "1710000000.000100",
        type: "message",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toEqual({
      destinationChannel: "CHOME",
      originChannel: "CALERT",
      originThreadTs: "1710000000.000100",
      ruleId: "alert-channel",
      text: "<@UR5BOT> 심각도 분석해서 원본 알람 스레드에 오너 자격으로 답해줘.\n원본 알람:\n```[critical] API latency high```",
    });
  });

  it("renders alert channel handoffs for Slack thread broadcasts", () => {
    const result = buildHandoff({
      alertChannelIds: ["CALERT"],
      event: {
        bot_id: "BALERT",
        channel: "CALERT",
        subtype: "thread_broadcast",
        text: "[critical] API latency high",
        thread_ts: "1710000000.000100",
        ts: "1710000001.000200",
        type: "message",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toEqual({
      destinationChannel: "CHOME",
      originChannel: "CALERT",
      originThreadTs: "1710000000.000100",
      ruleId: "alert-channel",
      text: "<@UR5BOT> 심각도 분석해서 원본 알람 스레드에 오너 자격으로 답해줘.\n원본 알람:\n```[critical] API latency high```",
    });
  });

  it("ignores alert channel thread replies", () => {
    const result = buildHandoff({
      alertChannelIds: ["CALERT"],
      event: {
        channel: "CALERT",
        text: "follow-up inside the alert thread",
        thread_ts: "1710000000.000100",
        ts: "1710000001.000200",
        type: "message",
        user: "UASKER",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("ignores Slack thread aggregate events in alert channels", () => {
    const result = buildHandoff({
      alertChannelIds: ["CALERT"],
      event: {
        channel: "CALERT",
        subtype: "message_replied",
        ts: "1710000000.000100",
        type: "message",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("ignores bot messages outside configured alert channels", () => {
    const result = buildHandoff({
      alertChannelIds: ["CALERT"],
      event: {
        bot_id: "BALERT",
        channel: "CNONALERT",
        subtype: "bot_message",
        text: "[critical] API latency high",
        ts: "1710000000.000100",
        type: "message",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("ignores alert channel messages from Tezentica itself", () => {
    const result = buildHandoff({
      alertChannelIds: ["CALERT"],
      event: {
        bot_id: "BTEZENTICA",
        channel: "CALERT",
        subtype: "bot_message",
        text: "<@UR5BOT> 심각도 분석해줘.",
        ts: "1710000000.000100",
        type: "message",
        user: "UTEZENTICA",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      selfBotId: "BTEZENTICA",
      selfUserId: "UTEZENTICA",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });

  it("ignores alert channel messages from the target bot", () => {
    const result = buildHandoff({
      alertChannelIds: ["CALERT"],
      event: {
        bot_id: "BR5",
        channel: "CALERT",
        subtype: "bot_message",
        text: "분석 결과입니다.",
        ts: "1710000000.000100",
        type: "message",
        user: "UR5BOT",
      },
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    expect(result).toBeNull();
  });
});

describe("composeHandoffMessage", () => {
  it("appends a machine-readable handoff pointer with the permalink", () => {
    const handoff: Handoff = {
      destinationChannel: "CHOME",
      originChannel: "C123",
      originThreadTs: "1710000000.000100",
      ruleId: "owner-mention",
      text: "<@UR5BOT> 이 작업 처리하고 원본 스레드에 오너 자격으로 답해줘.\n원본 메시지:\n```help```",
    };
    const permalink =
      "https://example.slack.com/archives/C123/p1710000000000100";

    const pointer = JSON.stringify({
      action: "handoff",
      origin_channel: "C123",
      origin_thread_ts: "1710000000.000100",
      permalink,
      rule: "owner-mention",
    });

    expect(composeHandoffMessage(handoff, permalink)).toBe(
      `${handoff.text}\n\`\`\`json\n${pointer}\n\`\`\``
    );
  });
});
