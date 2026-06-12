# Tezentica

Cloudflare Worker Slack bot that forwards owner mentions to a configured bot in the
same Slack thread exactly once.

## Runtime

Create `.dev.vars` from `.dev.vars.example`:

```dotenv
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=...
OWNER_USER_ID=...
TARGET_BOT_USER_ID=...
HANDOFF_MESSAGE_TEMPLATE=...
```

Only `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `OWNER_USER_ID`, and
`TARGET_BOT_USER_ID` are required. `HANDOFF_MESSAGE_TEMPLATE` is optional and
may use `{target}` for `<@TARGET_BOT_USER_ID>`.

## Local Dev

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs `wrangler dev` and `scripts/slack.ts tunnel`. The tunnel helper
prints the Slack Request URL as:

```txt
https://<public-tunnel-origin>/slack/events
```

If `cloudflared` is not installed, run any HTTPS tunnel to
`http://127.0.0.1:8792` and set Slack's Request URL to
`<public-tunnel-origin>/slack/events`.

## Deploy

```sh
pnpm ship -- --worker-url https://<deployed-worker-origin>
```

`pnpm ship` uploads `.dev.vars` with `wrangler secret bulk .dev.vars`, deploys
the Worker, then prints the deployed Slack Request URL:

```txt
https://<deployed-worker-origin>/slack/events
```

## Slack App

Configure the Slack app with:

- Bot token scopes: `chat:write`, `channels:history`, `groups:history`
- Event subscriptions: `message.channels`, `message.groups`
- Request URL: the local tunnel or deployed Worker `/slack/events` URL

Invite the bot to private channels that need coverage. The bot sees channel
messages only where it is present and only replies when the message text contains
the exact owner mention `<@OWNER_USER_ID>`.

## Verification

```sh
pnpm check
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry-run
```
