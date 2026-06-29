import { describe, expect, it } from "vitest";

import { createWorker } from "../src/index";
import {
  createSignedSlackRequest,
  createWorkerEnv,
  postMessageRequests,
  readPostedMessage,
  SLACK_PERMALINK,
} from "./worker-flow-helpers";

describe("Slack handoff Worker reliability flow", () => {
  it("releases the dedupe claim so a failed post can be retried", async () => {
    const slackRequests: Request[] = [];
    let postAttempts = 0;
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: (request) => {
        slackRequests.push(request);

        if (new URL(request.url).pathname.endsWith("/chat.getPermalink")) {
          return Promise.resolve(
            Response.json({ ok: true, permalink: SLACK_PERMALINK })
          );
        }

        postAttempts += 1;

        if (postAttempts === 1) {
          return Promise.resolve(
            Response.json({ error: "ratelimited", ok: false })
          );
        }

        return Promise.resolve(
          Response.json({ ok: true, ts: "1710000001.000200" })
        );
      },
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

    const failed = await worker.fetch(
      await createSignedSlackRequest(body),
      env
    );
    const retried = await worker.fetch(
      await createSignedSlackRequest(body),
      env
    );

    expect(failed.status).toBe(500);
    expect(retried.status).toBe(200);

    const posts = postMessageRequests(slackRequests);
    expect(posts).toHaveLength(2);

    const posted = await readPostedMessage(posts[1]);
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain("```please check <@UOWNER>```");
    expect(posted.text).toContain("agent-slack message replies C123");
    expect(posted.text).toContain("agent-slackbot message send C123");
    expect(posted.text).toContain("--thread 1710000000.000100");
  });

  it("still posts the handoff with an empty permalink when getPermalink fails", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: (request) => {
        slackRequests.push(request);

        if (new URL(request.url).pathname.endsWith("/chat.getPermalink")) {
          return Promise.resolve(
            Response.json({ error: "message_not_found", ok: false })
          );
        }

        return Promise.resolve(
          Response.json({ ok: true, ts: "1710000001.000200" })
        );
      },
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

    const response = await worker.fetch(
      await createSignedSlackRequest(body),
      createWorkerEnv()
    );

    expect(response.status).toBe(200);

    const posts = postMessageRequests(slackRequests);
    expect(posts).toHaveLength(1);

    const posted = await readPostedMessage(posts[0]);
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain("agent-slack message replies C123");
    expect(posted.text).toContain("agent-slackbot message send C123");
    expect(posted.text).toContain("--thread 1710000000.000100");
    expect(posted.text).toContain("원본 링크: ");
  });
});
