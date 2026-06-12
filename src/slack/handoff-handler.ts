import type { WorkerConfig } from "../config";
import { buildHandoff } from "../handoff";
import { postSlackThreadReply, type SlackTransport } from "./client";
import type { SlackEventCallbackEnvelope } from "./events";

export type MessageDedupeStub = {
  fetch(request: Request): Promise<Response>;
};

export type MessageDedupeNamespace<TId> = {
  get(id: TId): MessageDedupeStub;
  idFromName(name: string): TId;
};

export type ProcessSlackHandoffInput<TId> = {
  readonly callback: SlackEventCallbackEnvelope;
  readonly config: WorkerConfig;
  readonly dedupeNamespace: MessageDedupeNamespace<TId>;
  readonly slackApiBaseUrl?: string;
  readonly slackTransport?: SlackTransport;
};

const claimResponseSchema = {
  isClaimed(payload: unknown): payload is { readonly claimed: boolean } {
    return (
      typeof payload === "object" &&
      payload !== null &&
      "claimed" in payload &&
      typeof payload.claimed === "boolean"
    );
  },
};

export async function processSlackHandoff<TId>(
  input: ProcessSlackHandoffInput<TId>,
): Promise<void> {
  const handoff = buildHandoff({
    event: input.callback.event,
    ...(input.config.HANDOFF_MESSAGE_TEMPLATE === undefined
      ? {}
      : { handoffMessageTemplate: input.config.HANDOFF_MESSAGE_TEMPLATE }),
    ownerUserId: input.config.OWNER_USER_ID,
    targetBotUserId: input.config.TARGET_BOT_USER_ID,
  });

  if (!handoff) {
    return;
  }

  const claimed = await claimMessageOnce({
    dedupeNamespace: input.dedupeNamespace,
    key: `${input.callback.team_id}:${handoff.channel}:${input.callback.event.ts}`,
  });

  if (!claimed) {
    return;
  }

  await postSlackThreadReply(
    {
      ...(input.slackApiBaseUrl === undefined ? {} : { apiBaseUrl: input.slackApiBaseUrl }),
      botToken: input.config.SLACK_BOT_TOKEN,
      channel: handoff.channel,
      text: handoff.text,
      threadTs: handoff.threadTs,
    },
    input.slackTransport,
  );
}

type ClaimMessageOnceInput<TId> = {
  readonly dedupeNamespace: MessageDedupeNamespace<TId>;
  readonly key: string;
};

async function claimMessageOnce<TId>(input: ClaimMessageOnceInput<TId>): Promise<boolean> {
  const id = input.dedupeNamespace.idFromName(input.key);
  const stub = input.dedupeNamespace.get(id);
  const response = await stub.fetch(
    new Request("https://message-dedupe.local/claim", {
      body: JSON.stringify({ key: input.key }),
      method: "POST",
    }),
  );
  const payload: unknown = await response.json();

  if (!response.ok || !claimResponseSchema.isClaimed(payload)) {
    throw new Error("message dedupe claim failed");
  }

  return payload.claimed;
}
