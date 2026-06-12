import { z } from "zod";

import { parseSlackEventCallbackEnvelope, type SlackEventCallbackEnvelope } from "./events";

export type SlackRequestOptions = {
  readonly nowSeconds: () => number;
  readonly onEventCallback?: (envelope: SlackEventCallbackEnvelope) => Promise<void>;
  readonly signingSecret: string;
};

const slackSignatureVersion = "v0";
const maxTimestampSkewSeconds = 60 * 5;
const urlVerificationEnvelopeSchema = z.object({
  challenge: z.string(),
  type: z.literal("url_verification"),
});

export async function handleSlackEventsRequest(
  request: Request,
  options: SlackRequestOptions,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature || timestampIsStale(timestamp, options.nowSeconds())) {
    return new Response("invalid Slack signature", { status: 401 });
  }

  const body = await request.text();
  const expectedSignature = await signSlackBody({
    body,
    signingSecret: options.signingSecret,
    timestamp,
  });

  if (!constantTimeEqual(signature, expectedSignature)) {
    return new Response("invalid Slack signature", { status: 401 });
  }

  const envelope = parseJson(body);
  const urlVerification = urlVerificationEnvelopeSchema.safeParse(envelope);

  if (urlVerification.success) {
    return new Response(urlVerification.data.challenge);
  }

  const eventCallback = parseSlackEventCallbackEnvelope(envelope);

  if (eventCallback) {
    await options.onEventCallback?.(eventCallback);
  }

  return new Response("ok");
}

type SignSlackBodyInput = {
  readonly body: string;
  readonly signingSecret: string;
  readonly timestamp: string;
};

async function signSlackBody(input: SignSlackBodyInput): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.signingSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const base = `${slackSignatureVersion}:${input.timestamp}:${input.body}`;
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(base));

  return `${slackSignatureVersion}=${toHex(new Uint8Array(digest))}`;
}

function timestampIsStale(timestamp: string, nowSeconds: number): boolean {
  const parsed = Number.parseInt(timestamp, 10);

  return !Number.isFinite(parsed) || Math.abs(nowSeconds - parsed) > maxTimestampSkewSeconds;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length === rightBytes.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    const leftByte = leftBytes[index] ?? 0;
    const rightByte = rightBytes[index] ?? 0;
    diff |= leftByte ^ rightByte;
  }

  return diff === 0;
}

function parseJson(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body);

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}
