import { describe, expect, it } from "vitest";

import {
  type DedupeStorage,
  type DedupeTransaction,
  MessageDedupeObject,
} from "../src/dedupe-object";
import { createWorker } from "../src/index";
import type { SlackTransport } from "../src/slack/client";
import type {
  MessageDedupeNamespace,
  MessageDedupeStub,
} from "../src/slack/handoff-handler";

const SLACK_PERMALINK =
  "https://example.slack.com/archives/C123/p1710000000000100";

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

    const posted = (await posts[0]?.json()) as {
      channel: string;
      text: string;
      thread_ts?: string;
    };
    // Posted to the private home channel as a top-level message...
    expect(posted.channel).toBe("CHOME");
    expect(posted.thread_ts).toBeUndefined();
    // ...tagging the env-configured agent, quoting the original message, and
    // embedding the agent-slack command pointed at the ORIGIN thread.
    expect(posted.text).toContain("<@UR5BOT>");
    expect(posted.text).toContain("```please check <@UOWNER>```");
    expect(posted.text).toContain("agent-slack message send C123");
    expect(posted.text).toContain("--thread 1710000000.000100");
    expect(posted.text).toContain(SLACK_PERMALINK);
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

    const posted = (await posts[0]?.json()) as {
      channel: string;
      text: string;
    };
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain("<@UR5BOT>");
    expect(posted.text).toContain("```[critical] API latency high```");
    expect(posted.text).toContain("agent-slack message send CALERT");
    expect(posted.text).toContain("--thread 1710000000.000300");
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

    // First delivery surfaces the Slack failure (so Slack retries); the retry
    // succeeds because the claim was released rather than silently consumed.
    expect(failed.status).toBe(500);
    expect(retried.status).toBe(200);

    const posts = postMessageRequests(slackRequests);
    expect(posts).toHaveLength(2);

    // The recovered (second) post must deliver the complete, correct handoff,
    // not a truncated or mis-routed one.
    const posted = (await posts[1]?.json()) as {
      channel: string;
      text: string;
    };
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain("```please check <@UOWNER>```");
    expect(posted.text).toContain("agent-slack message send C123");
    expect(posted.text).toContain("--thread 1710000000.000100");
  });

  it("ignores an owner-authored message end-to-end so the reply-as-owner loop is broken", async () => {
    // The target bot replies "as the owner" into the public thread; that reply
    // arrives back as an owner-authored event and must never re-trigger.
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: createSlackTransport(slackRequests),
    });
    const body = JSON.stringify({
      event: {
        channel: "C123",
        text: "<@UOWNER> 처리했습니다",
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
    expect(slackRequests).toHaveLength(0);
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

    // Permalink fetch failed, so the link is empty — but the handoff still
    // posts with the working agent-slack command (origin channel + thread).
    const posted = (await posts[0]?.json()) as {
      channel: string;
      text: string;
    };
    expect(posted.channel).toBe("CHOME");
    expect(posted.text).toContain("agent-slack message send C123");
    expect(posted.text).toContain("--thread 1710000000.000100");
    expect(posted.text).toContain("원본 링크: ");
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

function createSlackTransport(captured: Request[]): SlackTransport {
  return (request) => {
    captured.push(request);

    if (new URL(request.url).pathname.endsWith("/chat.getPermalink")) {
      return Promise.resolve(
        Response.json({ ok: true, permalink: SLACK_PERMALINK })
      );
    }

    return Promise.resolve(
      Response.json({ ok: true, ts: "1710000001.000200" })
    );
  };
}

function postMessageRequests(requests: readonly Request[]): Request[] {
  return requests.filter((request) =>
    new URL(request.url).pathname.endsWith("/chat.postMessage")
  );
}

function createWorkerEnv(
  overrides: Partial<TestWorkerEnv> = {}
): TestWorkerEnv {
  return {
    ALERT_CHANNEL_IDS: "",
    HOME_CHANNEL_ID: "CHOME",
    MESSAGE_DEDUPE: new FakeDedupeNamespace(),
    OWNER_USER_ID: "UOWNER",
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_BOT_USER_ID: "UTEZENTICA",
    SLACK_SIGNING_SECRET: "secret",
    TARGET_BOT_USER_ID: "UR5BOT",
    ...overrides,
  };
}

interface TestWorkerEnv {
  readonly ALERT_CHANNEL_IDS: string;
  readonly HOME_CHANNEL_ID: string;
  readonly MESSAGE_DEDUPE: MessageDedupeNamespace<string>;
  readonly OWNER_USER_ID: string;
  readonly SLACK_BOT_TOKEN: string;
  readonly SLACK_BOT_USER_ID: string;
  readonly SLACK_SIGNING_SECRET: string;
  readonly TARGET_BOT_USER_ID: string;
}

async function createSignedSlackRequest(body: string): Promise<Request> {
  const timestamp = "1710000000";

  return new Request("https://worker.example/slack/events", {
    body,
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": await signTestSlackBody({
        body,
        signingSecret: "secret",
        timestamp,
      }),
    },
    method: "POST",
  });
}

interface SignTestSlackBodyInput {
  readonly body: string;
  readonly signingSecret: string;
  readonly timestamp: string;
}

async function signTestSlackBody(
  input: SignTestSlackBodyInput
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.signingSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const base = `v0:${input.timestamp}:${input.body}`;
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(base));
  const bytes = new Uint8Array(digest);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `v0=${hex}`;
}

class FakeDedupeNamespace implements MessageDedupeNamespace<string> {
  private readonly object = new MessageDedupeObject({
    storage: new InMemoryDedupeStorage(),
  });

  get(): MessageDedupeStub {
    return {
      fetch: (request) => this.object.fetch(request),
    };
  }

  idFromName(name: string): string {
    return name;
  }
}

class InMemoryDedupeStorage implements DedupeStorage {
  readonly seen = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

  transaction<T>(closure: (txn: DedupeTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(() =>
      closure(new InMemoryDedupeTransaction(this.seen))
    );
    this.queue = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  }
}

class InMemoryDedupeTransaction implements DedupeTransaction {
  private readonly seen: Set<string>;

  constructor(seen: Set<string>) {
    this.seen = seen;
  }

  delete(key: string): Promise<void> {
    this.seen.delete(key);

    return Promise.resolve();
  }

  get(key: string): Promise<boolean | undefined> {
    return Promise.resolve(this.seen.has(key) ? true : undefined);
  }

  put(key: string, value: boolean): Promise<void> {
    if (value) {
      this.seen.add(key);
    }

    return Promise.resolve();
  }
}
