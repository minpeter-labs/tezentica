import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runSlackSetup } from "../scripts/slack";

describe("runSlackSetup", () => {
  it("prints local tunnel and deployed Slack Request URLs without URL env secrets", async () => {
    const envFile = createEnvFile();
    const output: string[] = [];

    const tunnelCode = await runSlackSetup(
      ["tunnel", "--env-file", envFile, "--public-url", "https://local.example"],
      { stdout: (line) => output.push(line) },
    );
    const webhookCode = await runSlackSetup(
      ["webhook", "--env-file", envFile, "--worker-url", "https://worker.example"],
      { stdout: (line) => output.push(line) },
    );

    expect(tunnelCode).toBe(0);
    expect(webhookCode).toBe(0);
    expect(output).toContain("Slack Request URL: https://local.example/slack/events");
    expect(output).toContain("Slack Request URL: https://worker.example/slack/events");
    expect(output.join("\n")).not.toContain("xoxb-secret-token");
    expect(output.join("\n")).not.toContain("signing-secret");
  });

  it("rejects missing required runtime env without requiring a URL env secret", async () => {
    const envFile = createEnvFile("SLACK_SIGNING_SECRET=signing-secret\n");
    const output: string[] = [];

    const code = await runSlackSetup(
      ["webhook", "--env-file", envFile, "--worker-url", "https://worker.example"],
      {
        stderr: (line) => output.push(line),
      },
    );

    expect(code).toBe(1);
    expect(output.join("\n")).toContain("SLACK_BOT_TOKEN is required");
    expect(output.join("\n")).not.toContain("WORKER_PUBLIC_URL");
  });

  it("prints a clear manual tunnel fallback when cloudflared is unavailable", async () => {
    const envFile = createEnvFile();
    const output: string[] = [];

    const code = await runSlackSetup(["tunnel", "--env-file", envFile], {
      commandExists: () => false,
      stderr: (line) => output.push(line),
    });

    expect(code).toBe(1);
    expect(output.join("\n")).toContain("cloudflared is not available");
    expect(output.join("\n")).toContain("<public-tunnel-origin>/slack/events");
  });
});

function createEnvFile(contents = validEnvContents()): string {
  const directory = mkdtempSync(join(tmpdir(), "tezentica-env-"));
  const envFile = join(directory, ".dev.vars");
  writeFileSync(envFile, contents);

  return envFile;
}

function validEnvContents(): string {
  return [
    "SLACK_SIGNING_SECRET=signing-secret",
    "SLACK_BOT_TOKEN=xoxb-secret-token",
    "OWNER_USER_ID=UOWNER",
    "TARGET_BOT_USER_ID=UR5BOT",
    "HANDOFF_MESSAGE_TEMPLATE={target} custom",
  ].join("\n");
}
