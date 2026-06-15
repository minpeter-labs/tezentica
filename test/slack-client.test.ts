import { describe, expect, it } from "vitest";

import {
  getSlackPermalink,
  postSlackMessage,
  SlackApiError,
} from "../src/slack/client";

describe("postSlackMessage", () => {
  it("posts a thread reply with bearer token", async () => {
    const calls: Request[] = [];
    const transport = (request: Request): Promise<Response> => {
      calls.push(request);

      return Promise.resolve(
        Response.json({ ok: true, ts: "1710000001.000200" })
      );
    };

    await postSlackMessage(
      {
        botToken: "xoxb-token",
        channel: "C123",
        text: "<@UR5BOT> 이 작업 처리해라.",
        threadTs: "1710000000.000100",
      },
      transport
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

  it("omits thread_ts when posting a top-level message", async () => {
    const calls: Request[] = [];
    const transport = (request: Request): Promise<Response> => {
      calls.push(request);

      return Promise.resolve(
        Response.json({ ok: true, ts: "1710000001.000200" })
      );
    };

    await postSlackMessage(
      {
        botToken: "xoxb-token",
        channel: "CHOME",
        text: "<@UR5BOT> 처리 부탁",
      },
      transport
    );

    expect(await calls[0]?.json()).toEqual({
      channel: "CHOME",
      text: "<@UR5BOT> 처리 부탁",
    });
  });

  it("maps Slack non-ok responses without leaking the bot token", async () => {
    const error = await postSlackMessage(
      {
        botToken: "xoxb-secret-token",
        channel: "C123",
        text: "<@UR5BOT> 이 작업 처리해라.",
        threadTs: "1710000000.000100",
      },
      () => Promise.resolve(Response.json({ error: "invalid_auth", ok: false }))
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SlackApiError);
    expect(error).toMatchObject({
      message: "invalid_auth",
      status: 200,
    });
    expect(String(error)).not.toContain("xoxb-secret-token");
  });
});

describe("getSlackPermalink", () => {
  it("requests the permalink for the origin message and returns it", async () => {
    const calls: Request[] = [];
    const transport = (request: Request): Promise<Response> => {
      calls.push(request);

      return Promise.resolve(
        Response.json({
          ok: true,
          permalink:
            "https://example.slack.com/archives/C123/p1710000000000100",
        })
      );
    };

    const permalink = await getSlackPermalink(
      {
        botToken: "xoxb-token",
        channel: "C123",
        messageTs: "1710000000.000100",
      },
      transport
    );

    expect(permalink).toBe(
      "https://example.slack.com/archives/C123/p1710000000000100"
    );

    const request = calls[0];
    expect(request?.headers.get("authorization")).toBe("Bearer xoxb-token");
    const url = new URL(request?.url ?? "");
    expect(url.pathname).toBe("/api/chat.getPermalink");
    expect(url.searchParams.get("channel")).toBe("C123");
    expect(url.searchParams.get("message_ts")).toBe("1710000000.000100");
  });

  it("throws a SlackApiError when Slack reports a failure", async () => {
    const error = await getSlackPermalink(
      {
        botToken: "xoxb-secret-token",
        channel: "C123",
        messageTs: "1710000000.000100",
      },
      () =>
        Promise.resolve(
          Response.json({ error: "message_not_found", ok: false })
        )
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SlackApiError);
    expect(String(error)).not.toContain("xoxb-secret-token");
  });
});
