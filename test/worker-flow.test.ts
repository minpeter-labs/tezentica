import { describe, expect, it } from "vitest";

import { createWorker } from "../src/index";
import {
  createSignedSlackRequest,
  createSlackTransport,
  createWorkerEnv,
  postMessageRequests,
  readPostedMessage,
  SLACK_PERMALINK,
} from "./worker-flow-helpers";

describe("Slack handoff Worker flow", () => {
  it("routes a duplicate owner-mention to the home channel exactly once", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const env = createWorkerEnv();
    const body = JSON.stringify({
      event: {
        channel: "C123",
        text: "please check <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
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
    expect(posted.thread_ts).toBeUndefined();
    expect(posted.text).toContain("<@UR5BOT>");
    expect(posted.text).toContain("```please check <@UOWNER>```");
    expect(posted.text).toContain(
      "agent-slackbot reaction add C123 1710000000.000100 robot_face"
    );
    expect(posted.text).toContain("agent-slack message replies C123");
    expect(posted.text).toContain("agent-slackbot message send C123");
    expect(
      posted.text.indexOf(
        "agent-slackbot reaction add C123 1710000000.000100 robot_face"
      )
    ).toBeLessThan(posted.text.indexOf("agent-slack message replies C123"));
    expect(posted.text).toContain("--thread 1710000000.000100");
    expect(posted.text).toContain(SLACK_PERMALINK);
  });

  it("routes review owner mentions with legacy agent-slack reply guidance", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const body = JSON.stringify({
      event: {
        channel: "C123",
        text: "<@UOWNER> 이 PR 리뷰해줘",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      team_id: "T123",
      type: "event_callback",
    });

    const response = await worker.fetch(
      await createSignedSlackRequest(body),
      createWorkerEnv()
    );

    expect(response.status).toBe(200);

    const posts = postMessageRequests(slackRequests);
    expect(posts).toHaveLength(1);

    const posted = await readPostedMessage(posts[0]);
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain("```<@UOWNER> 이 PR 리뷰해줘```");
    expect(posted.text).toContain(
      "agent-slackbot reaction add C123 1710000000.000100 robot_face"
    );
    expect(posted.text).toContain(
      '답글: agent-slack message send C123 "(답변)" --thread 1710000000.000100'
    );
    expect(posted.text).toContain("리뷰 요청 예외");
    expect(posted.text).not.toContain("agent-slackbot message send");
  });

  it("ignores signed messages that do not mention the owner", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const body = JSON.stringify({
      event: {
        channel: "C123",
        text: "plain message",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      team_id: "T123",
      type: "event_callback",
    });

    const response = await worker.fetch(
      await createSignedSlackRequest(body),
      createWorkerEnv()
    );

    expect(response.status).toBe(200);
    expect(slackRequests).toHaveLength(0);
  });

  it("routes an owner-authored self-mention end-to-end", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const body = JSON.stringify({
      event: {
        channel: "C123",
        text: "<@UOWNER> 테젠티카 테스트 응답, 안녕하세요. 라고 응답하세요",
        ts: "1710000000.000100",
        type: "message",
        user: "UOWNER",
      },
      team_id: "T123",
      type: "event_callback",
    });

    const response = await worker.fetch(
      await createSignedSlackRequest(body),
      createWorkerEnv()
    );

    expect(response.status).toBe(200);

    const posts = postMessageRequests(slackRequests);
    expect(posts).toHaveLength(1);

    const posted = await readPostedMessage(posts[0]);
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain(
      "```<@UOWNER> 테젠티카 테스트 응답, 안녕하세요. 라고 응답하세요```"
    );
    expect(posted.text).toContain("agent-slackbot message send C123");
  });

  it("ignores events originating in the home channel end-to-end", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const body = JSON.stringify({
      event: {
        channel: "CHOME",
        text: "please check <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      team_id: "T123",
      type: "event_callback",
    });

    const response = await worker.fetch(
      await createSignedSlackRequest(body),
      createWorkerEnv()
    );

    expect(response.status).toBe(200);
    expect(slackRequests).toHaveLength(0);
  });

  it("resolves the permalink against the origin channel, not the home channel", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const body = JSON.stringify({
      event: {
        channel: "C123",
        text: "please check <@UOWNER>",
        ts: "1710000000.000100",
        type: "message",
        user: "UASKER",
      },
      team_id: "T123",
      type: "event_callback",
    });

    await worker.fetch(await createSignedSlackRequest(body), createWorkerEnv());

    const permalinkRequest = slackRequests.find((request) =>
      new URL(request.url).pathname.endsWith("/chat.getPermalink")
    );
    const permalinkUrl = new URL(permalinkRequest?.url ?? "");
    expect(permalinkUrl.searchParams.get("channel")).toBe("C123");
    expect(permalinkUrl.searchParams.get("message_ts")).toBe(
      "1710000000.000100"
    );
  });
});
