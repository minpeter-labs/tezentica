import {
  type DedupeStorage,
  type DedupeTransaction,
  MessageDedupeObject,
} from "../src/dedupe-object";
import type { SlackTransport } from "../src/slack/client";
import type {
  MessageDedupeNamespace,
  MessageDedupeStub,
} from "../src/slack/handoff-handler";

export const SLACK_PERMALINK =
  "https://example.slack.com/archives/C123/p1710000000000100";

export interface PostedSlackMessage {
  readonly channel: string;
  readonly text: string;
  readonly thread_ts?: string;
}

interface PostedSlackMessageCandidate {
  readonly channel?: unknown;
  readonly text?: unknown;
  readonly thread_ts?: unknown;
}

export function createSlackTransport(captured: Request[]): SlackTransport {
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

export function postMessageRequests(requests: readonly Request[]): Request[] {
  return requests.filter((request) =>
    new URL(request.url).pathname.endsWith("/chat.postMessage")
  );
}

export async function readPostedMessage(
  request: Request | undefined
): Promise<PostedSlackMessage> {
  const body: unknown = await request?.json();

  if (!isPostedSlackMessage(body)) {
    throw new InvalidPostedMessageError();
  }

  return body;
}

export function createWorkerEnv(
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

export interface TestWorkerEnv {
  readonly ALERT_CHANNEL_IDS: string;
  readonly HOME_CHANNEL_ID: string;
  readonly MESSAGE_DEDUPE: MessageDedupeNamespace<string>;
  readonly OWNER_USER_ID: string;
  readonly SLACK_BOT_TOKEN: string;
  readonly SLACK_BOT_USER_ID: string;
  readonly SLACK_SIGNING_SECRET: string;
  readonly TARGET_BOT_USER_ID: string;
}

export async function createSignedSlackRequest(body: string): Promise<Request> {
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

function isPostedSlackMessage(value: unknown): value is PostedSlackMessage {
  if (!isPostedSlackMessageCandidate(value)) {
    return false;
  }

  const channel = value.channel;
  const text = value.text;
  const threadTs = value.thread_ts;

  return (
    typeof channel === "string" &&
    typeof text === "string" &&
    (threadTs === undefined || typeof threadTs === "string")
  );
}

function isPostedSlackMessageCandidate(
  value: unknown
): value is PostedSlackMessageCandidate {
  return typeof value === "object" && value !== null;
}

class InvalidPostedMessageError extends Error {
  constructor() {
    super("expected Slack post body to contain channel and text");
    this.name = "InvalidPostedMessageError";
  }
}
