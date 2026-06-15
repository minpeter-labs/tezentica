import { z } from "zod";

export type SlackTransport = (request: Request) => Promise<Response>;

export interface PostSlackMessageInput {
  readonly apiBaseUrl?: string;
  readonly botToken: string;
  readonly channel: string;
  readonly text: string;
  readonly threadTs?: string;
}

export interface GetSlackPermalinkInput {
  readonly apiBaseUrl?: string;
  readonly botToken: string;
  readonly channel: string;
  readonly messageTs: string;
}

const chatPostMessageResponseSchema = z.object({
  error: z.string().optional(),
  ok: z.boolean(),
  ts: z.string().optional(),
});
const getPermalinkResponseSchema = z.object({
  error: z.string().optional(),
  ok: z.boolean(),
  permalink: z.string().optional(),
});
const defaultSlackApiBaseUrl = "https://slack.com/api";

export class SlackApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
    this.name = "SlackApiError";
  }
}

export async function postSlackMessage(
  input: PostSlackMessageInput,
  transport: SlackTransport = fetch
): Promise<void> {
  const response = await transport(
    new Request(
      new URL(
        "chat.postMessage",
        withTrailingSlash(input.apiBaseUrl ?? defaultSlackApiBaseUrl)
      ),
      {
        body: JSON.stringify({
          channel: input.channel,
          text: input.text,
          ...(input.threadTs === undefined
            ? {}
            : { thread_ts: input.threadTs }),
        }),
        headers: {
          authorization: `Bearer ${input.botToken}`,
          "content-type": "application/json",
        },
        method: "POST",
      }
    )
  );

  const payload: unknown = await response.json();
  const parsed = chatPostMessageResponseSchema.parse(payload);

  if (!(response.ok && parsed.ok)) {
    throw new SlackApiError(
      parsed.error ?? "chat.postMessage failed",
      response.status
    );
  }
}

// Resolves the public archive URL of the triggering message so the handoff
// pointer can carry a direct link. Requires no extra OAuth scope.
export async function getSlackPermalink(
  input: GetSlackPermalinkInput,
  transport: SlackTransport = fetch
): Promise<string> {
  const url = new URL(
    "chat.getPermalink",
    withTrailingSlash(input.apiBaseUrl ?? defaultSlackApiBaseUrl)
  );
  url.searchParams.set("channel", input.channel);
  url.searchParams.set("message_ts", input.messageTs);

  const response = await transport(
    new Request(url, {
      headers: { authorization: `Bearer ${input.botToken}` },
      method: "GET",
    })
  );

  const payload: unknown = await response.json();
  const parsed = getPermalinkResponseSchema.parse(payload);

  if (!(response.ok && parsed.ok) || parsed.permalink === undefined) {
    throw new SlackApiError(
      parsed.error ?? "chat.getPermalink failed",
      response.status
    );
  }

  return parsed.permalink;
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
