# Tezentica

Slack owner-mention handoff bot on Cloudflare Workers.

When a Slack message mentions `OWNER_USER_ID`, Tezentica replies once in the same
thread, tags `TARGET_BOT_USER_ID`, and includes the original message:

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
HANDOFF_MESSAGE_TEMPLATE="{target} 이 작업 처리해라.\n원본 메시지:\n```{message}```"
````

Use `https://tezentica.vooy.workers.dev/slack/events` as the Slack Event
Subscriptions Request URL.

## Commands

```sh
pnpm check
pnpm ship -- --worker-url https://tezentica.vooy.workers.dev
```
