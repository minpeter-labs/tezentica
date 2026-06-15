import type { WorkerConfig } from "../config";
import { buildHandoff, renderHandoffMessage } from "../handoff";
import {
  getSlackPermalink,
  postSlackMessage,
  type SlackTransport,
} from "./client";
import type { SlackEventCallbackEnvelope } from "./events";

export interface MessageDedupeStub {
  fetch(request: Request): Promise<Response>;
}

export interface MessageDedupeNamespace<TId> {
  get(id: TId): MessageDedupeStub;
  idFromName(name: string): TId;
}

export interface ProcessSlackHandoffInput<TId> {
  readonly callback: SlackEventCallbackEnvelope;
  readonly config: WorkerConfig;
  readonly dedupeNamespace: MessageDedupeNamespace<TId>;
  readonly slackApiBaseUrl?: string;
  readonly slackTransport?: SlackTransport;
}

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
  input: ProcessSlackHandoffInput<TId>
): Promise<void> {
  const handoff = buildHandoff({
    alertChannelIds: input.config.ALERT_CHANNEL_IDS,
    event: input.callback.event,
    ...(input.config.HANDOFF_MESSAGE_TEMPLATE === undefined
      ? {}
      : { handoffMessageTemplate: input.config.HANDOFF_MESSAGE_TEMPLATE }),
    homeChannelId: input.config.HOME_CHANNEL_ID,
    ownerUserId: input.config.OWNER_USER_ID,
    ...(input.config.SLACK_BOT_USER_ID === undefined
      ? {}
      : { selfUserId: input.config.SLACK_BOT_USER_ID }),
    targetBotUserId: input.config.TARGET_BOT_USER_ID,
  });

  if (!handoff) {
    return;
  }

  // Key on the ORIGIN message: the destination is always the home channel, so
  // keying on it would collapse unrelated source threads into one claim.
  const dedupeKey = `${input.callback.team_id}:${handoff.originChannel}:${input.callback.event.ts}:${handoff.ruleId}`;

  const claimed = await claimMessageOnce({
    dedupeNamespace: input.dedupeNamespace,
    key: dedupeKey,
  });

  if (!claimed) {
    return;
  }

  try {
    const permalink = await resolveOriginPermalink(
      input,
      handoff.originChannel
    );

    await postSlackMessage(
      {
        ...(input.slackApiBaseUrl === undefined
          ? {}
          : { apiBaseUrl: input.slackApiBaseUrl }),
        botToken: input.config.SLACK_BOT_TOKEN,
        channel: handoff.destinationChannel,
        text: renderHandoffMessage(handoff, permalink),
      },
      input.slackTransport
    );
  } catch (error) {
    // Release the claim so Slack's retry can re-deliver. Without this, a
    // transient post failure would consume the claim and silently drop the
    // handoff forever. If the release itself fails, preserve and rethrow the
    // ORIGINAL post error (don't mask it) and log the stuck key so it is
    // observable rather than silently un-retryable.
    try {
      await releaseMessageClaim({
        dedupeNamespace: input.dedupeNamespace,
        key: dedupeKey,
      });
    } catch (releaseError) {
      console.error("failed to release dedupe claim", {
        key: dedupeKey,
        releaseError,
      });
    }

    throw error;
  }
}

// Best-effort: a missing permalink must not block the handoff, so failures
// fall back to an empty link rather than aborting (and consuming the claim).
async function resolveOriginPermalink<TId>(
  input: ProcessSlackHandoffInput<TId>,
  originChannel: string
): Promise<string> {
  try {
    return await getSlackPermalink(
      {
        ...(input.slackApiBaseUrl === undefined
          ? {}
          : { apiBaseUrl: input.slackApiBaseUrl }),
        botToken: input.config.SLACK_BOT_TOKEN,
        channel: originChannel,
        messageTs: input.callback.event.ts,
      },
      input.slackTransport
    );
  } catch {
    return "";
  }
}

interface ClaimMessageInput<TId> {
  readonly dedupeNamespace: MessageDedupeNamespace<TId>;
  readonly key: string;
}

async function claimMessageOnce<TId>(
  input: ClaimMessageInput<TId>
): Promise<boolean> {
  const stub = input.dedupeNamespace.get(
    input.dedupeNamespace.idFromName(input.key)
  );
  const response = await stub.fetch(
    new Request("https://message-dedupe.local/claim", {
      body: JSON.stringify({ action: "claim", key: input.key }),
      method: "POST",
    })
  );
  const payload: unknown = await response.json();

  if (!(response.ok && claimResponseSchema.isClaimed(payload))) {
    throw new Error("message dedupe claim failed");
  }

  return payload.claimed;
}

async function releaseMessageClaim<TId>(
  input: ClaimMessageInput<TId>
): Promise<void> {
  const stub = input.dedupeNamespace.get(
    input.dedupeNamespace.idFromName(input.key)
  );
  const response = await stub.fetch(
    new Request("https://message-dedupe.local/release", {
      body: JSON.stringify({ action: "release", key: input.key }),
      method: "POST",
    })
  );

  if (!response.ok) {
    throw new Error("message dedupe release failed");
  }
}
