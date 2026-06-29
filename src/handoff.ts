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
  readonly message: string;
  readonly originChannel: string;
  readonly originThreadTs: string;
  readonly ruleId: string;
  readonly targetBotUserId: string;
  readonly template: string;
}

const alertChannelRuleId = "alert-channel";
const agentSlackbotReplyGuide =
  '"웅기님이 바쁘셔서 대신 답변드려요."처럼 웅기님 대신 답변한다는 점을 먼저 밝혀줘.';
const alertChannelTemplate = `{target} 아래 알람의 심각도를 분석한 뒤, agent-slack으로 원본 알람 스레드를 읽고 agent-slackbot으로 답글을 남겨줘.\n원본 알람:\n\`\`\`{message}\`\`\`\n읽기: agent-slack message replies {origin_channel} {origin_thread_ts}\n답글: agent-slackbot message send {origin_channel} "(답변)" --thread {origin_thread_ts}\n답글 가이드: ${agentSlackbotReplyGuide}\n원본 링크: {permalink}`;
const defaultHandoffMessageTemplate = `{target} 아래 요청을 처리한 뒤, agent-slack으로 원본 스레드를 읽고 agent-slackbot으로 답글을 남겨줘.\n원본 메시지:\n\`\`\`{message}\`\`\`\n읽기: agent-slack message replies {origin_channel} {origin_thread_ts}\n답글: agent-slackbot message send {origin_channel} "(답변)" --thread {origin_thread_ts}\n답글 가이드: ${agentSlackbotReplyGuide}\n원본 링크: {permalink}`;
const ownerMentionRuleId = "owner-mention";

export function buildHandoff(input: HandoffInput): Handoff | null {
  if (input.event.channel === input.homeChannelId) {
    return null;
  }

  const text = input.event.text ?? "";

  if (isAlertChannelMessage(input)) {
    return {
      destinationChannel: input.homeChannelId,
      message: text,
      originChannel: input.event.channel,
      originThreadTs: input.event.thread_ts ?? input.event.ts,
      ruleId: alertChannelRuleId,
      targetBotUserId: input.targetBotUserId,
      template: alertChannelTemplate,
    };
  }

  if (isOwnerMentionMessage(input)) {
    return {
      destinationChannel: input.homeChannelId,
      message: text,
      originChannel: input.event.channel,
      originThreadTs: input.event.thread_ts ?? input.event.ts,
      ruleId: ownerMentionRuleId,
      targetBotUserId: input.targetBotUserId,
      template: input.handoffMessageTemplate ?? defaultHandoffMessageTemplate,
    };
  }

  return null;
}

export function renderHandoffMessage(
  handoff: Handoff,
  permalink: string
): string {
  return handoff.template
    .replaceAll("{target}", `<@${handoff.targetBotUserId}>`)
    .replaceAll("{origin_channel}", handoff.originChannel)
    .replaceAll("{origin_thread_ts}", handoff.originThreadTs)
    .replaceAll("{permalink}", permalink)
    .replaceAll("{message}", escapeSlackCodeFence(handoff.message));
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
