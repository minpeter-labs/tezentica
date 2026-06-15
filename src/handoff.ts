export interface SlackMessageEvent {
  readonly bot_id?: string;
  readonly channel: string;
  readonly subtype?: string;
  readonly text?: string;
  readonly thread_ts?: string;
  readonly ts: string;
  readonly type: "message";
  readonly user?: string;
}

export interface HandoffInput {
  readonly alertChannelIds?: readonly string[];
  readonly event: SlackMessageEvent;
  readonly handoffMessageTemplate?: string;
  readonly ownerUserId: string;
  readonly selfBotId?: string;
  readonly selfUserId?: string;
  readonly targetBotUserId: string;
}

export interface Handoff {
  readonly channel: string;
  readonly ruleId: string;
  readonly text: string;
  readonly threadTs: string;
}

const alertChannelRuleId = "alert-channel";
const alertChannelTemplate =
  "{target} 심각도 분석해줘.\n원본 알람:\n```{message}```";
const defaultHandoffMessageTemplate =
  "{target} 이 작업 처리해라.\n원본 메시지:\n```{message}```";
const ownerMentionRuleId = "owner-mention";

export function buildHandoff(input: HandoffInput): Handoff | null {
  const text = input.event.text ?? "";

  if (isAlertChannelMessage(input)) {
    return {
      channel: input.event.channel,
      ruleId: alertChannelRuleId,
      text: renderHandoffMessage({
        message: text,
        targetBotUserId: input.targetBotUserId,
        template: alertChannelTemplate,
      }),
      threadTs: input.event.thread_ts ?? input.event.ts,
    };
  }

  if (isOwnerMentionMessage(input)) {
    return {
      channel: input.event.channel,
      ruleId: ownerMentionRuleId,
      text: renderHandoffMessage({
        message: text,
        targetBotUserId: input.targetBotUserId,
        template: input.handoffMessageTemplate ?? defaultHandoffMessageTemplate,
      }),
      threadTs: input.event.thread_ts ?? input.event.ts,
    };
  }

  return null;
}

interface RenderHandoffMessageInput {
  readonly message: string;
  readonly targetBotUserId: string;
  readonly template: string;
}

function renderHandoffMessage(input: RenderHandoffMessageInput): string {
  return input.template
    .replaceAll("{target}", `<@${input.targetBotUserId}>`)
    .replaceAll("{message}", escapeSlackCodeFence(input.message));
}

function escapeSlackCodeFence(text: string): string {
  return text.replaceAll("```", "`\u200b``");
}

function isAlertChannelMessage(input: HandoffInput): boolean {
  const alertChannelIds = input.alertChannelIds ?? [];

  return (
    alertChannelIds.includes(input.event.channel) &&
    isAlertChannelRootMessage(input.event) &&
    !isSelfMessage({
      event: input.event,
      ...(input.selfBotId === undefined ? {} : { selfBotId: input.selfBotId }),
      ...(input.selfUserId === undefined
        ? {}
        : { selfUserId: input.selfUserId }),
      targetBotUserId: input.targetBotUserId,
    })
  );
}

function isAlertChannelRootMessage(event: SlackMessageEvent): boolean {
  if (event.subtype === "thread_broadcast") {
    return true;
  }

  if (event.thread_ts !== undefined && event.thread_ts !== event.ts) {
    return false;
  }

  return event.subtype === undefined || event.subtype === "bot_message";
}

function isOwnerMentionMessage(input: HandoffInput): boolean {
  if (!isOrdinaryUserMessage(input.event)) {
    return false;
  }

  const text = input.event.text ?? "";
  const ownerMention = `<@${input.ownerUserId}>`;

  return text.includes(ownerMention);
}

interface SelfMessageInput {
  readonly event: SlackMessageEvent;
  readonly selfBotId?: string;
  readonly selfUserId?: string;
  readonly targetBotUserId: string;
}

function isSelfMessage(input: SelfMessageInput): boolean {
  return (
    (input.selfBotId !== undefined && input.event.bot_id === input.selfBotId) ||
    (input.selfUserId !== undefined && input.event.user === input.selfUserId) ||
    input.event.user === input.targetBotUserId
  );
}

function isOrdinaryUserMessage(event: SlackMessageEvent): boolean {
  return event.type === "message" && !event.bot_id && !event.subtype;
}
