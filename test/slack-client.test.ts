import { describe, expect, it } from "vitest";

import { postSlackThreadReply, SlackApiError } from "../src/slack/client";

describe("postSlackThreadReply", () => {
  it("posts a thread reply with bearer token", async () => {
    const calls: Request[] = [];
    const transport = async (request: Request): Promise<Response> => {
      calls.push(request);

      return Response.json({ ok: true, ts: "1710000001.000200" });
    };

    await postSlackThreadReply(
      {
        botToken: "xoxb-token",
        channel: "C123",
        text: "<@UR5BOT> 이 작업 처리해라.",
        threadTs: "1710000000.000100",
      },
      transport,
    );

    const request = calls[0];
    expect(request).toBeDefined();
    expect(request?.url).toBe("https://slack.com/api/chat.postMessage");
    expect(request?.headers.get("authorization")).toBe("Bearer xoxb-token");
    expect(await request?.json()).toEqual({
      channel: "C123",
      text: "<@UR5BOT> 이 작업 처리해라.",
      thread_ts: "1710000000.000100",
    });
  });

  it("maps Slack non-ok responses without leaking the bot token", async () => {
    const error = await postSlackThreadReply(
      {
        botToken: "xoxb-secret-token",
        channel: "C123",
        text: "<@UR5BOT> 이 작업 처리해라.",
        threadTs: "1710000000.000100",
      },
      async () => Response.json({ error: "invalid_auth", ok: false }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SlackApiError);
    expect(error).toMatchObject({
      message: "invalid_auth",
      status: 200,
    });
    expect(String(error)).not.toContain("xoxb-secret-token");
  });
});
