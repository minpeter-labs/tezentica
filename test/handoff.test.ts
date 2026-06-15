import { describe, expect, it } from "vitest";

import {
  buildHandoff,
  type Handoff,
  renderHandoffMessage,
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

    expect(result).toMatchObject({
      destinationChannel: "CHOME",
      message: "please help <@UOWNER>",
      originChannel: "C123",
      originThreadTs: "1710000000.000100",
      ruleId: "owner-mention",
      targetBotUserId: "UR5BOT",
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

    expect(result).toMatchObject({
      destinationChannel: "CHOME",
      message: "[critical] API latency high",
      originChannel: "CALERT",
      originThreadTs: "1710000000.000100",
      ruleId: "alert-channel",
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

    expect(result?.originThreadTs).toBe("1710000000.000100");
    expect(result?.ruleId).toBe("alert-channel");
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

describe("renderHandoffMessage", () => {
  const baseHandoff: Handoff = {
    destinationChannel: "CHOME",
    message: "hello <@U1>",
    originChannel: "C123",
    originThreadTs: "1710000000.000100",
    ruleId: "owner-mention",
    targetBotUserId: "UR5BOT",
    template:
      "{target}|{origin_channel}|{origin_thread_ts}|{permalink}|{message}",
  };

  it("substitutes every placeholder, message last", () => {
    expect(renderHandoffMessage(baseHandoff, "https://slack.example/p1")).toBe(
      "<@UR5BOT>|C123|1710000000.000100|https://slack.example/p1|hello <@U1>"
    );
  });

  it("never re-interprets the original message as another placeholder", () => {
    const handoff: Handoff = {
      ...baseHandoff,
      message: "{origin_channel}",
      template: "{origin_channel}:{message}",
    };

    expect(renderHandoffMessage(handoff, "")).toBe("C123:{origin_channel}");
  });

  it("keeps Slack code fences closed when the message contains backticks", () => {
    const handoff: Handoff = {
      ...baseHandoff,
      message: "use ```danger```",
      template: "```{message}```",
    };

    expect(renderHandoffMessage(handoff, "")).toBe("```use `​``danger`​`````");
  });

  it("embeds a ready-to-run agent-slack command for the default owner template", () => {
    const handoff = buildHandoff({
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
    const rendered = renderHandoffMessage(
      handoff as Handoff,
      "https://slack.example/p1"
    );

    expect(rendered).toContain("<@UR5BOT>");
    expect(rendered).toContain("```please help <@UOWNER>```");
    expect(rendered).toContain("agent-slack message send C123");
    expect(rendered).toContain("--thread 1710000000.000100");
    expect(rendered).toContain("https://slack.example/p1");
  });
});
