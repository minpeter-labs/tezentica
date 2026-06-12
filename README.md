# Tezentica

Slack owner-mention handoff bot on Cloudflare Workers.

When a Slack message mentions `OWNER_USER_ID`, Tezentica replies once in the same
thread and tags `TARGET_BOT_USER_ID`. When a message lands in an
`ALERT_CHANNEL_IDS` channel, Tezentica asks the same target bot for severity
analysis.

````text
<@TARGET_BOT_USER_ID> 이 작업 처리해라.
원본 메시지:
```original message```
````

## What Changed

- Handoff replies now include the original Slack message via `{message}`.
- The local `dev`/tunnel path was removed. Slack Event Subscriptions have one
  active Request URL, so this app is configured against the deployed Worker.

## Config

Required secrets:

```dotenv
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=...
OWNER_USER_ID=...
TARGET_BOT_USER_ID=...
```

Optional:

````dotenv
ALERT_CHANNEL_IDS=C123,C456
HANDOFF_MESSAGE_TEMPLATE="{target} 이 작업 처리해라.\n원본 메시지:\n```{message}```"
SLACK_BOT_USER_ID=...
````

Use `https://tezentica.vooy.workers.dev/slack/events` as the Slack Event
Subscriptions Request URL.

## Commands

```sh
pnpm check
pnpm ship -- --worker-url https://tezentica.vooy.workers.dev
```
