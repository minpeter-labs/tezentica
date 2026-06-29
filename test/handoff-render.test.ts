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
    ownerUserId: "UOWNER",
    replyTool: "agent-slackbot",
    ruleId: "owner-mention",
    targetBotUserId: "UR5BOT",
    template:
      "{target}|{origin_channel}|{origin_thread_ts}|{permalink}|{message}",
  };

  it("substitutes every placeholder, message last", () => {
    expect(
      renderHandoffMessage(baseHandoff, "https://slack.example/p1")
    ).toMatch(
      "<@UR5BOT>|C123|1710000000.000100|https://slack.example/p1|hello <@U1>"
    );
  });

  it("never re-interprets the original message as another placeholder", () => {
    const handoff: Handoff = {
      ...baseHandoff,
      message: "{origin_channel}",
      template: "{origin_channel}:{message}",
    };

    expect(renderHandoffMessage(handoff, "")).toContain(
      "C123:{origin_channel}\n답글 가이드:"
    );
  });

  it("keeps Slack code fences closed when the message contains backticks", () => {
    const handoff: Handoff = {
      ...baseHandoff,
      message: "use ```danger```",
      template: "```{message}```",
    };

    expect(renderHandoffMessage(handoff, "")).toContain(
      "```use `​``danger`​`````\n답글 가이드:"
    );
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
    expect(rendered).toContain("스레드에 <@UOWNER> 답장이 이미 있으면");
    expect(rendered).toContain(
      '"웅기님이 까먹으신 것 같아서 정보 보충드립니다."로 시작해'
    );
    expect(rendered).toContain("추가할 정보가 없으면 공개 답글을 남기지 마");
    expect(rendered).toContain("--thread 1710000000.000100");
    expect(rendered).toContain("https://slack.example/p1");
  });

  it("always appends the agent-slackbot reply guide to custom owner templates", () => {
    const handoff = buildHandoff({
      event: {
        channel: "C123",
        text: "please help <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      handoffMessageTemplate: "커스텀 요청: {message}",
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    if (handoff === null) {
      throw new Error("expected owner mention to produce a handoff");
    }

    const rendered = renderHandoffMessage(handoff, "https://slack.example/p1");

    expect(rendered).toContain("커스텀 요청: please help <@UOWNER>");
    expect(rendered).toContain("답글 가이드:");
    expect(rendered).toContain("agent-slackbot");
    expect(rendered).toContain("추가할 정보가 없으면 공개 답글을 남기지 마");
  });

  it("uses the legacy agent-slack reply path when the trigger includes review", () => {
    const handoff = buildHandoff({
      event: {
        channel: "C123",
        text: "<@UOWNER> 이 PR 리뷰해줘",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      handoffMessageTemplate:
        '커스텀 요청: {message}\n답글: agent-slackbot message send {origin_channel} "(답변)" --thread {origin_thread_ts}',
      homeChannelId: "CHOME",
      ownerUserId: "UOWNER",
      targetBotUserId: "UR5BOT",
    });

    if (handoff === null) {
      throw new Error("expected owner mention to produce a handoff");
    }

    const rendered = renderHandoffMessage(handoff, "https://slack.example/p1");

    expect(rendered).toContain("커스텀 요청: <@UOWNER> 이 PR 리뷰해줘");
    expect(rendered).toContain(
      '답글: agent-slack message send C123 "(답변)" --thread 1710000000.000100'
    );
    expect(rendered).toContain("리뷰 요청 예외");
    expect(rendered).not.toContain("agent-slackbot");
    expect(rendered).not.toContain("웅기님이 바쁘셔서 대신 답변드려요");
  });
});
