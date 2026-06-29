import { describe, expect, it } from "vitest";

import { createWorker } from "../src/index";
import {
  createSignedSlackRequest,
  createSlackTransport,
  createWorkerEnv,
  postMessageRequests,
  readPostedMessage,
} from "./worker-flow-helpers";

describe("Slack handoff Worker alert flow", () => {
  it("routes a duplicate alert channel bot event to the home channel once", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const env = createWorkerEnv({
      ALERT_CHANNEL_IDS: "CALERT",
      SLACK_BOT_USER_ID: "UTEZENTICA",
    });
    const body = JSON.stringify({
      event: {
        bot_id: "BALERT",
        channel: "CALERT",
        subtype: "bot_message",
        text: "[critical] API latency high",
        ts: "1710000000.000300",
        type: "message",
      },
      team_id: "T123",
      type: "event_callback",
    });

    const first = await worker.fetch(await createSignedSlackRequest(body), env);
    const second = await worker.fetch(
      await createSignedSlackRequest(body),
      env
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const posts = postMessageRequests(slackRequests);
    expect(posts).toHaveLength(1);

    const posted = await readPostedMessage(posts[0]);
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain("<@UR5BOT>");
    expect(posted.text).toContain("```[critical] API latency high```");
    expect(posted.text).toContain("agent-slack message replies CALERT");
    expect(posted.text).toContain("agent-slackbot message send CALERT");
    expect(posted.text).toContain("모드: 봇 모드 / 순수 봇 역할");
    expect(posted.text).toContain("마지막 문장은 반드시 :robot: 이모지로 끝내");
    expect(posted.text).not.toContain("웅기님");
    expect(posted.text).toContain("alert/watch 채널 예외");
    expect(posted.text).toContain("--thread 1710000000.000300");
  });

  it("keeps alert channel review messages on agent-slackbot in pure bot mode", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const env = createWorkerEnv({
      ALERT_CHANNEL_IDS: "CALERT",
      SLACK_BOT_USER_ID: "UTEZENTICA",
    });
    const body = JSON.stringify({
      event: {
        bot_id: "BALERT",
        channel: "CALERT",
        subtype: "bot_message",
        text: "[critical] 리뷰 queue stuck",
        ts: "1710000000.000300",
        type: "message",
      },
      team_id: "T123",
      type: "event_callback",
    });

    const response = await worker.fetch(
      await createSignedSlackRequest(body),
      env
    );

    expect(response.status).toBe(200);

    const posts = postMessageRequests(slackRequests);
    expect(posts).toHaveLength(1);

    const posted = await readPostedMessage(posts[0]);
    expect(posted.text).toContain("```[critical] 리뷰 queue stuck```");
    expect(posted.text).toContain("agent-slackbot message send CALERT");
    expect(posted.text).toContain("모드: 봇 모드 / 순수 봇 역할");
    expect(posted.text).toContain("마지막 문장은 반드시 :robot: 이모지로 끝내");
    expect(posted.text).not.toContain("웅기님");
    expect(posted.text).toContain("alert/watch 채널 예외");
    expect(posted.text).not.toContain("리뷰 요청 예외");
    expect(posted.text).not.toContain("agent-slack message send CALERT");
  });

  it("ignores non-alert bot messages and Tezentica or target bot alert messages", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const env = createWorkerEnv({
      ALERT_CHANNEL_IDS: "CALERT",
      SLACK_BOT_USER_ID: "UTEZENTICA",
    });
    const nonAlertBody = JSON.stringify({
      event: {
        bot_id: "BALERT",
        channel: "CNONALERT",
        subtype: "bot_message",
        text: "[critical] API latency high",
        ts: "1710000000.000400",
        type: "message",
      },
      team_id: "T123",
      type: "event_callback",
    });
    const selfBody = JSON.stringify({
      event: {
        bot_id: "BTEZENTICA",
        channel: "CALERT",
        subtype: "bot_message",
        text: "<@UR5BOT> 심각도 분석해줘.",
        ts: "1710000000.000500",
        type: "message",
        user: "UTEZENTICA",
      },
      team_id: "T123",
      type: "event_callback",
    });
    const targetBotBody = JSON.stringify({
      event: {
        bot_id: "BR5",
        channel: "CALERT",
        subtype: "bot_message",
        text: "분석 결과입니다.",
        ts: "1710000000.000550",
        type: "message",
        user: "UR5BOT",
      },
      team_id: "T123",
      type: "event_callback",
    });

    const nonAlert = await worker.fetch(
      await createSignedSlackRequest(nonAlertBody),
      env
    );
    const self = await worker.fetch(
      await createSignedSlackRequest(selfBody),
      env
    );
    const targetBot = await worker.fetch(
      await createSignedSlackRequest(targetBotBody),
      env
    );

    expect(nonAlert.status).toBe(200);
    expect(self.status).toBe(200);
    expect(targetBot.status).toBe(200);
    expect(slackRequests).toHaveLength(0);
  });
});
