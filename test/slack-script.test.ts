import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runSlackSetup } from "../scripts/slack";

describe("runSlackSetup", () => {
  it("prints the deployed Slack Request URL without env secrets", async () => {
    const envFile = createEnvFile();
    const output: string[] = [];

    const webhookCode = await runSlackSetup(
      ["webhook", "--env-file", envFile, "--worker-url", "https://worker.example"],
      { stdout: (line) => output.push(line) },
    );

    expect(webhookCode).toBe(0);
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

  it("rejects the old tunnel command because Slack has one active Request URL", async () => {
    const envFile = createEnvFile();
    const output: string[] = [];

    const code = await runSlackSetup(["tunnel", "--env-file", envFile], {
      stderr: (line) => output.push(line),
    });

    expect(code).toBe(1);
    expect(output.join("\n")).toContain("usage: slack.ts webhook");
    expect(output.join("\n")).toContain("Slack Event Subscriptions support one active Request URL");
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
