# Tezentica

Slack owner-mention handoff bot on Cloudflare Workers.

Tezentica keeps the automation invisible to the public channel. When a trigger
fires, it does **not** reply in the public thread. Instead it pings the target
bot (`TARGET_BOT_USER_ID`) in a private **home channel** (`HOME_CHANNEL_ID`,
owner + bots only) with a machine-readable pointer to the original thread. The
target bot then reads that thread and replies in it **as the owner**, so the
public channel only ever shows what looks like the owner's own message.

## Triggers

- **Owner mention** — a message in any watched channel mentions `OWNER_USER_ID`.
- **Alert channel** — a root message lands in an `ALERT_CHANNEL_IDS` channel; the
  target bot is asked for severity analysis.

## Handoff message

Tezentica posts a top-level message to the home channel: a human-readable
instruction plus a fenced pointer the target bot parses.

````text
<@TARGET_BOT_USER_ID> 이 작업 처리하고 원본 스레드에 오너 자격으로 답해줘.
원본 메시지:
```original message```
```json
{"action":"handoff","origin_channel":"C123","origin_thread_ts":"...","permalink":"...","rule":"owner-mention"}
```
````

The target bot uses `origin_channel` + `origin_thread_ts` (and `permalink`) to
read the thread and reply into it with a **user token**, so the reply shows the
owner's identity rather than a bot.

## Loop & privacy guards

- Events originating in `HOME_CHANNEL_ID` are ignored.
- Events authored by `OWNER_USER_ID` are ignored — this is what the target bot
  posts "as the owner" into the original thread, so honoring it would loop.
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
HANDOFF_MESSAGE_TEMPLATE="{target} 이 작업 처리하고 원본 스레드에 오너 자격으로 답해줘.\n원본 메시지:\n```{message}```"
SLACK_BOT_USER_ID=...
````

Use `https://tezentica.vooy.workers.dev/slack/events` as the Slack Event
Subscriptions Request URL.

## Commands

```sh
pnpm check
pnpm ship -- --worker-url https://tezentica.vooy.workers.dev
```
