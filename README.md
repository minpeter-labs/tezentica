# Tezentica

Slack owner-mention handoff bot on Cloudflare Workers.

Tezentica keeps the automation invisible to the public channel. When a trigger
fires, it does **not** reply in the public thread. Instead it pings the target
agent (`TARGET_BOT_USER_ID`) in a private **home channel** (`HOME_CHANNEL_ID`,
owner + bots only) with ready-to-run CLI instructions. The agent reads the
original thread with `agent-slack` and replies in it with `agent-slackbot`, so
the public channel never sees Tezentica's handoff chatter.

## Triggers

- **Owner mention** — a message in any watched channel mentions `OWNER_USER_ID`.
- **Alert channel** — a root message lands in an `ALERT_CHANNEL_IDS` channel; the
  target agent is asked for severity analysis.

## Handoff message

Tezentica posts a top-level message to the home channel — a natural-language
instruction with the exact [`agent-slack`](https://github.com/stablyai/agent-slack)
read command and `agent-slackbot` reply command, pre-filled with the origin
channel and thread:

````text
<@TARGET_BOT_USER_ID> 아래 요청을 처리한 뒤, agent-slack으로 원본 스레드를 읽고 agent-slackbot으로 답글을 남겨줘.
원본 메시지:
```original message```
읽기: agent-slack message replies C123 1710000000.000100
답글: agent-slackbot message send C123 "(답변)" --thread 1710000000.000100
원본 링크: https://…
답글 가이드:
- 먼저 agent-slack으로 원본 스레드 replies를 읽어.
- 스레드에 <@OWNER_USER_ID> 답장이 이미 있으면, 네가 아는 메모리나 맥락 중 보충할 정보가 있을 때만 agent-slackbot으로 추가 답글을 보내. 이때는 "웅기님이 까먹으신 것 같아서 정보 보충드립니다."로 시작해.
- 스레드에 <@OWNER_USER_ID> 답장이 없으면 agent-slackbot으로 "웅기님이 바쁘셔서 대신 답변드려요."처럼 웅기님 대신 답변한다는 점을 먼저 밝혀줘. 처리 요청이면 "웅기님이 바쁘셔서 대신 처리해 드립니다."처럼 시작해.
- 이미 답했고 추가할 정보가 없으면 공개 답글을 남기지 마.
````

The agent runs `agent-slack` for thread reads and `agent-slackbot` for thread
replies. The runtime must be able to execute both CLIs, and `agent-slackbot`
must be authenticated to the bot identity that should appear in the public
thread. Tezentica always appends the reply guide as a reminder, even when
`HANDOFF_MESSAGE_TEMPLATE` overrides the main instruction.

The instruction is configurable via `HANDOFF_MESSAGE_TEMPLATE` with the
placeholders `{target}`, `{message}`, `{origin_channel}`, `{origin_thread_ts}`,
and `{permalink}`. `{message}` is always substituted last so its contents can't
be re-interpreted as a placeholder.

> ⚠️ Posting auto-generated content under a human identity is a Slack
> Developer-Policy gray area — fine for your **own account / internal use**, not
> for Marketplace distribution.

## Loop & privacy guards

- Events originating in `HOME_CHANNEL_ID` are ignored.
- Bot-message owner mentions are ignored, so `agent-slackbot` replies do not
  retrigger the owner-mention handoff.
- Never add the home channel to `ALERT_CHANNEL_IDS`.

## Reliability

The dedupe claim is released if the Slack post fails, so Slack's retry can
re-deliver the handoff instead of it being silently dropped.

## Config

Required secrets:

```dotenv
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=...
OWNER_USER_ID=...
TARGET_BOT_USER_ID=...
HOME_CHANNEL_ID=...
```

Optional:

````dotenv
ALERT_CHANNEL_IDS=C123,C456
HANDOFF_MESSAGE_TEMPLATE="{target} 처리하고 답글 달아줘.\n```{message}```\n읽기: agent-slack message replies {origin_channel} {origin_thread_ts}\n답글: agent-slackbot message send {origin_channel} \"(답변)\" --thread {origin_thread_ts}"
SLACK_BOT_USER_ID=...
````

Use `https://tezentica.vooy.workers.dev/slack/events` as the Slack Event
Subscriptions Request URL.

## Commands

```sh
pnpm check
pnpm ship -- --worker-url https://tezentica.vooy.workers.dev
```
