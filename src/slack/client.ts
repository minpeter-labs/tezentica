import { z } from "zod";

export type SlackTransport = (request: Request) => Promise<Response>;

export type PostSlackThreadReplyInput = {
  readonly apiBaseUrl?: string;
  readonly botToken: string;
  readonly channel: string;
  readonly text: string;
  readonly threadTs: string;
};

const chatPostMessageResponseSchema = z.object({
  error: z.string().optional(),
  ok: z.boolean(),
  ts: z.string().optional(),
});
const defaultSlackApiBaseUrl = "https://slack.com/api";

export class SlackApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "SlackApiError";
  }
}

export async function postSlackThreadReply(
  input: PostSlackThreadReplyInput,
  transport: SlackTransport = fetch,
): Promise<void> {
  const response = await transport(
    new Request(
      new URL("chat.postMessage", withTrailingSlash(input.apiBaseUrl ?? defaultSlackApiBaseUrl)),
      {
        body: JSON.stringify({
          channel: input.channel,
          text: input.text,
          thread_ts: input.threadTs,
        }),
        headers: {
          authorization: `Bearer ${input.botToken}`,
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
  );

  const payload: unknown = await response.json();
  const parsed = chatPostMessageResponseSchema.parse(payload);

  if (!response.ok || !parsed.ok) {
    throw new SlackApiError(parsed.error ?? "chat.postMessage failed", response.status);
  }
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
