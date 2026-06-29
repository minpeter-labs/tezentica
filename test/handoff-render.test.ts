import { describe, expect, it } from "vitest";

import {
  buildHandoff,
  type Handoff,
  renderHandoffMessage,
} from "../src/handoff";

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

  it("keeps reads on agent-slack and replies on agent-slackbot for the default owner template", () => {
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

    if (handoff === null) {
      throw new Error("expected owner mention to produce a handoff");
    }

    const rendered = renderHandoffMessage(handoff, "https://slack.example/p1");

    expect(rendered).toContain("<@UR5BOT>");
    expect(rendered).toContain("```please help <@UOWNER>```");
    expect(rendered).toContain("agent-slack message replies C123");
    expect(rendered).toContain("agent-slackbot message send C123");
    expect(rendered).toContain(
      '"웅기님이 바쁘셔서 대신 답변드려요."처럼 웅기님 대신 답변한다는 점을 먼저 밝혀줘.'
    );
    expect(rendered).toContain("--thread 1710000000.000100");
    expect(rendered).toContain("https://slack.example/p1");
  });
});
