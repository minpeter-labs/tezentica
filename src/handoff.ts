export type SlackMessageEvent = {
  readonly bot_id?: string;
  readonly channel: string;
  readonly subtype?: string;
  readonly text?: string;
  readonly thread_ts?: string;
  readonly ts: string;
  readonly type: "message";
  readonly user?: string;
};

export type HandoffInput = {
  readonly event: SlackMessageEvent;
  readonly handoffMessageTemplate?: string;
  readonly ownerUserId: string;
  readonly targetBotUserId: string;
};

export type Handoff = {
  readonly channel: string;
  readonly text: string;
  readonly threadTs: string;
};

const defaultHandoffMessageTemplate = "{target} 이 작업 처리해라.";

export function buildHandoff(input: HandoffInput): Handoff | null {
  if (!isOrdinaryUserMessage(input.event)) {
    return null;
  }

  const text = input.event.text ?? "";
  const ownerMention = `<@${input.ownerUserId}>`;

  if (!text.includes(ownerMention)) {
    return null;
  }

  return {
    channel: input.event.channel,
    text: renderHandoffMessage({
      targetBotUserId: input.targetBotUserId,
      template: input.handoffMessageTemplate ?? defaultHandoffMessageTemplate,
    }),
    threadTs: input.event.thread_ts ?? input.event.ts,
  };
}

type RenderHandoffMessageInput = {
  readonly targetBotUserId: string;
  readonly template: string;
};

function renderHandoffMessage(input: RenderHandoffMessageInput): string {
  return input.template.replaceAll("{target}", `<@${input.targetBotUserId}>`);
}

function isOrdinaryUserMessage(event: SlackMessageEvent): boolean {
  return event.type === "message" && !event.bot_id && !event.subtype;
}
