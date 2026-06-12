import { z } from "zod";

import type { SlackMessageEvent } from "../handoff";

const slackMessageEventSchema = z.object({
  bot_id: z.string().optional(),
  channel: z.string(),
  subtype: z.string().optional(),
  text: z.string().optional(),
  thread_ts: z.string().optional(),
  ts: z.string(),
  type: z.literal("message"),
  user: z.string().optional(),
});

const slackEventCallbackEnvelopeSchema = z.object({
  event: slackMessageEventSchema,
  team_id: z.string(),
  type: z.literal("event_callback"),
});

export type SlackEventCallbackEnvelope = {
  readonly event: SlackMessageEvent;
  readonly team_id: string;
  readonly type: "event_callback";
};

export function parseSlackEventCallbackEnvelope(
  envelope: unknown,
): SlackEventCallbackEnvelope | null {
  const result = slackEventCallbackEnvelopeSchema.safeParse(envelope);

  if (!result.success) {
    return null;
  }

  return {
    event: toSlackMessageEvent(result.data.event),
    team_id: result.data.team_id,
    type: result.data.type,
  };
}

function toSlackMessageEvent(event: z.infer<typeof slackMessageEventSchema>): SlackMessageEvent {
  return {
    ...(event.bot_id === undefined ? {} : { bot_id: event.bot_id }),
    channel: event.channel,
    ...(event.subtype === undefined ? {} : { subtype: event.subtype }),
    ...(event.text === undefined ? {} : { text: event.text }),
    ...(event.thread_ts === undefined ? {} : { thread_ts: event.thread_ts }),
    ts: event.ts,
    type: event.type,
    ...(event.user === undefined ? {} : { user: event.user }),
  };
}
