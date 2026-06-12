import { describe, expect, it } from "vitest";

import { handleSlackEventsRequest } from "../src/slack/http";

describe("handleSlackEventsRequest", () => {
  it("rejects non-POST Slack events requests", async () => {
    const request = new Request("https://worker.example/slack/events", {
      method: "GET",
    });

    const response = await handleSlackEventsRequest(request, {
      nowSeconds: () => 1710000000,
      signingSecret: "secret",
    });

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("method not allowed");
  });

  it("rejects stale Slack request timestamps", async () => {
    const body = JSON.stringify({
      challenge: "challenge-token",
      type: "url_verification",
    });
    const timestamp = "1709999000";
    const request = new Request("https://worker.example/slack/events", {
      body,
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": await signTestSlackBody({
          body,
          signingSecret: "secret",
          timestamp,
        }),
      },
      method: "POST",
    });

    const response = await handleSlackEventsRequest(request, {
      nowSeconds: () => 1710000000,
      signingSecret: "secret",
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("invalid Slack signature");
  });

  it("rejects invalid Slack signatures before parsing JSON", async () => {
    const malformedBody = "{";
    const request = new Request("https://worker.example/slack/events", {
      body: malformedBody,
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": "1710000000",
        "x-slack-signature": "v0=bad",
      },
      method: "POST",
    });

    const response = await handleSlackEventsRequest(request, {
      nowSeconds: () => 1710000000,
      signingSecret: "secret",
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("invalid Slack signature");
  });

  it("returns the Slack URL verification challenge for a valid signature", async () => {
    const body = JSON.stringify({
      challenge: "challenge-token",
      token: "deprecated-token",
      type: "url_verification",
    });
    const timestamp = "1710000000";
    const request = new Request("https://worker.example/slack/events", {
      body,
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": await signTestSlackBody({
          body,
          signingSecret: "secret",
          timestamp,
        }),
      },
      method: "POST",
    });

    const response = await handleSlackEventsRequest(request, {
      nowSeconds: () => 1710000000,
      signingSecret: "secret",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-token");
  });
});

type SignTestSlackBodyInput = {
  readonly body: string;
  readonly signingSecret: string;
  readonly timestamp: string;
};

async function signTestSlackBody(input: SignTestSlackBodyInput): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.signingSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const base = `v0:${input.timestamp}:${input.body}`;
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(base));
  const bytes = new Uint8Array(digest);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `v0=${hex}`;
}
