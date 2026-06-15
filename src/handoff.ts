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
  readonly homeChannelId: string;
  readonly ownerUserId: string;
  readonly selfBotId?: string;
  readonly selfUserId?: string;
  readonly targetBotUserId: string;
}

export interface Handoff {
  readonly destinationChannel: string;
  readonly originChannel: string;
  readonly originThreadTs: string;
  readonly ruleId: string;
  readonly text: string;
}

const alertChannelRuleId = "alert-channel";
const alertChannelTemplate =
  "{target} 심각도 분석해서 원본 알람 스레드에 오너 자격으로 답해줘.\n원본 알람:\n```{message}```";
const defaultHandoffMessageTemplate =
  "{target} 이 작업 처리하고 원본 스레드에 오너 자격으로 답해줘.\n원본 메시지:\n```{message}```";
const ownerMentionRuleId = "owner-mention";

export function buildHandoff(input: HandoffInput): Handoff | null {
  // Loop guards (must run first): never act on traffic from the private home
  // channel, and never act on messages authored by the owner — the latter is
  // exactly what the target agent posts "as the owner" into the original
  // thread, so honoring it would re-trigger the handoff endlessly.
  if (input.event.channel === input.homeChannelId) {
    return null;
  }

  if (
    input.event.user !== undefined &&
    input.event.user === input.ownerUserId
  ) {
    return null;
  }

  const text = input.event.text ?? "";

  if (isAlertChannelMessage(input)) {
    return {
      destinationChannel: input.homeChannelId,
      originChannel: input.event.channel,
      originThreadTs: input.event.thread_ts ?? input.event.ts,
      ruleId: alertChannelRuleId,
      text: renderHandoffMessage({
        message: text,
        targetBotUserId: input.targetBotUserId,
        template: alertChannelTemplate,
      }),
    };
  }

  if (isOwnerMentionMessage(input)) {
    return {
      destinationChannel: input.homeChannelId,
      originChannel: input.event.channel,
      originThreadTs: input.event.thread_ts ?? input.event.ts,
      ruleId: ownerMentionRuleId,
      text: renderHandoffMessage({
        message: text,
        targetBotUserId: input.targetBotUserId,
        template: input.handoffMessageTemplate ?? defaultHandoffMessageTemplate,
      }),
    };
  }

  return null;
}

// Appends a machine-readable pointer so the target agent (R5) knows exactly
// which public thread to read and reply into. Kept separate from buildHandoff
// because the permalink is resolved via a Slack API call after the decision.
export function composeHandoffMessage(
  handoff: Handoff,
  permalink: string
): string {
  const pointer = JSON.stringify({
    action: "handoff",
    origin_channel: handoff.originChannel,
    origin_thread_ts: handoff.originThreadTs,
    permalink,
    rule: handoff.ruleId,
  });

  return `${handoff.text}\n\`\`\`json\n${pointer}\n\`\`\``;
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
