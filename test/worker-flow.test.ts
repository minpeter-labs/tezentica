import { describe, expect, it } from "vitest";

import {
  type DedupeStorage,
  type DedupeTransaction,
  MessageDedupeObject,
} from "../src/dedupe-object";
import { createWorker } from "../src/index";
import type {
  MessageDedupeNamespace,
  MessageDedupeStub,
} from "../src/slack/handoff-handler";

describe("Slack handoff Worker flow", () => {
  it("replies once in-thread for duplicate signed owner-mention events", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: (request) => {
        slackRequests.push(request);

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

    const first = await worker.fetch(await createSignedSlackRequest(body), env);
    const second = await worker.fetch(
      await createSignedSlackRequest(body),
      env
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(slackRequests).toHaveLength(1);
    expect(await slackRequests[0]?.json()).toEqual({
      channel: "C123",
      text: "<@UR5BOT> 이 작업 처리해라.\n원본 메시지:\n```please check <@UOWNER>```",
      thread_ts: "1710000000.000100",
    });
  });

  it("ignores signed messages that do not mention the owner", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: (request) => {
        slackRequests.push(request);

        return Promise.resolve(
          Response.json({ ok: true, ts: "1710000001.000200" })
        );
      },
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

  it("replies once in-thread for duplicate signed alert channel bot events", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: (request) => {
        slackRequests.push(request);

        return Promise.resolve(
          Response.json({ ok: true, ts: "1710000001.000200" })
        );
      },
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
    expect(slackRequests).toHaveLength(1);
    expect(await slackRequests[0]?.json()).toEqual({
      channel: "CALERT",
      text: "<@UR5BOT> 심각도 분석해줘.\n원본 알람:\n```[critical] API latency high```",
      thread_ts: "1710000000.000300",
    });
  });

  it("ignores non-alert bot messages and Tezentica or target bot alert messages", async () => {
    const slackRequests: Request[] = [];
    const worker = createWorker<string>({
      nowSeconds: () => 1_710_000_000,
      slackTransport: (request) => {
        slackRequests.push(request);

        return Promise.resolve(
          Response.json({ ok: true, ts: "1710000001.000200" })
        );
      },
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

function createWorkerEnv(
  overrides: Partial<TestWorkerEnv> = {}
): TestWorkerEnv {
  return {
    ALERT_CHANNEL_IDS: "",
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
