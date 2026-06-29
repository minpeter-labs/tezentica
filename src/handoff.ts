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
  readonly ownerUserId: string;
  readonly replyGuideTemplate: string;
  readonly replyTool: ReplyTool;
  readonly ruleId: string;
  readonly targetBotUserId: string;
  readonly template: string;
}

type ReplyTool = typeof agentSlackReplyTool | typeof agentSlackbotReplyTool;

const agentSlackReplyTool = "agent-slack";
const agentSlackbotReplyTool = "agent-slackbot";
const alertChannelRuleId = "alert-channel";
const alertChannelTemplate =
  "{target} 아래 알람의 심각도를 분석한 뒤, agent-slack으로 원본 알람 스레드를 읽고 {reply_tool}으로 답글을 남겨줘.\n원본 알람:\n```{message}```\n읽기: agent-slack message replies {origin_channel} {origin_thread_ts}\n답글: {reply_command}\n원본 링크: {permalink}";
const alertChannelReplyGuideTemplate =
  '답글 가이드:\n- alert/watch 채널 예외: 리뷰 키워드가 있어도 agent-slackbot으로 답글을 남겨.\n- 먼저 agent-slack으로 원본 스레드 replies를 읽어.\n- 답글은 {reply_command} 명령으로 남겨.\n- 공개 답글은 "웅기님이 부재중이라 봇이 대신 답변드립니다. :robot_face:"처럼 시작해.\n- 봇/운영 알림 톤으로 간결하게 정리하고, 사람 계정으로 대신 답하는 말투는 쓰지 마.';
const defaultHandoffMessageTemplate =
  "{target} 아래 요청을 처리한 뒤, agent-slack으로 원본 스레드를 읽고 {reply_tool}으로 답글을 남겨줘.\n원본 메시지:\n```{message}```\n읽기: agent-slack message replies {origin_channel} {origin_thread_ts}\n답글: {reply_command}\n원본 링크: {permalink}";
const ownerMentionReplyGuideTemplate =
  '답글 가이드:\n- 먼저 agent-slack으로 원본 스레드 replies를 읽어.\n- 스레드에 <@{owner_user_id}> 답장이 이미 있으면, 네가 아는 메모리나 맥락 중 보충할 정보가 있을 때만 agent-slackbot으로 추가 답글을 보내. 이때는 "웅기님이 까먹으신 것 같아서 정보 보충드립니다."로 시작해.\n- 스레드에 <@{owner_user_id}> 답장이 없으면 agent-slackbot으로 "웅기님이 바쁘셔서 대신 답변드려요."처럼 웅기님 대신 답변한다는 점을 먼저 밝혀줘. 처리 요청이면 "웅기님이 바쁘셔서 대신 처리해 드립니다."처럼 시작해.\n- 이미 답했고 추가할 정보가 없으면 공개 답글을 남기지 마.';
const ownerMentionRuleId = "owner-mention";
const reviewReplyGuideTemplate =
  "답글 가이드:\n- 리뷰 요청 예외: 읽기와 답글 모두 agent-slack을 사용해.\n- 먼저 agent-slack으로 원본 스레드 replies를 읽어.\n- 답글은 {reply_command} 명령으로 남겨.\n- 대리 답변 문구는 붙이지 말고 기존 agent-slack 답장 가이드라인을 따라.";
const reviewReplyKeyword = "리뷰";

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
      ownerUserId: input.ownerUserId,
      replyGuideTemplate: alertChannelReplyGuideTemplate,
      replyTool: agentSlackbotReplyTool,
      ruleId: alertChannelRuleId,
      targetBotUserId: input.targetBotUserId,
      template: alertChannelTemplate,
    };
  }

  if (isOwnerMentionMessage(input)) {
    const replyPlan = selectOwnerMentionReplyPlan(text);

    return {
      destinationChannel: input.homeChannelId,
      message: text,
      originChannel: input.event.channel,
      originThreadTs: input.event.thread_ts ?? input.event.ts,
      ownerUserId: input.ownerUserId,
      replyGuideTemplate: replyPlan.replyGuideTemplate,
      replyTool: replyPlan.replyTool,
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
  const renderedTemplate = renderTemplate(handoff.template, handoff, permalink);
  const renderedReplyGuide = renderTemplate(
    handoff.replyGuideTemplate,
    handoff,
    permalink
  );

  return `${renderedTemplate}\n${renderedReplyGuide}`;
}

interface ReplyPlan {
  readonly replyGuideTemplate: string;
  readonly replyTool: ReplyTool;
}

function renderTemplate(
  template: string,
  handoff: Handoff,
  permalink: string
): string {
  return normalizeTemplateForReplyTool(template, handoff.replyTool)
    .replaceAll("{target}", `<@${handoff.targetBotUserId}>`)
    .replaceAll("{origin_channel}", handoff.originChannel)
    .replaceAll("{origin_thread_ts}", handoff.originThreadTs)
    .replaceAll("{owner_user_id}", handoff.ownerUserId)
    .replaceAll("{permalink}", permalink)
    .replaceAll("{reply_tool}", handoff.replyTool)
    .replaceAll("{reply_command}", renderReplyCommand(handoff))
    .replaceAll("{message}", escapeSlackCodeFence(handoff.message));
}

function renderReplyCommand(handoff: Handoff): string {
  return `${handoff.replyTool} message send ${handoff.originChannel} "(답변)" --thread ${handoff.originThreadTs}`;
}

function normalizeTemplateForReplyTool(
  template: string,
  replyTool: ReplyTool
): string {
  if (replyTool === agentSlackReplyTool) {
    return template.replaceAll(agentSlackbotReplyTool, agentSlackReplyTool);
  }

  return template;
}

function selectOwnerMentionReplyPlan(message: string): ReplyPlan {
  if (message.includes(reviewReplyKeyword)) {
    return {
      replyGuideTemplate: reviewReplyGuideTemplate,
      replyTool: agentSlackReplyTool,
    };
  }

  return {
    replyGuideTemplate: ownerMentionReplyGuideTemplate,
    replyTool: agentSlackbotReplyTool,
  };
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
