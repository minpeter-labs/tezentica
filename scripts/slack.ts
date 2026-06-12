import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { z } from "zod";

const requiredEnvSchema = z.object({
  OWNER_USER_ID: requiredEnvString("OWNER_USER_ID"),
  SLACK_BOT_TOKEN: requiredEnvString("SLACK_BOT_TOKEN"),
  SLACK_SIGNING_SECRET: requiredEnvString("SLACK_SIGNING_SECRET"),
  TARGET_BOT_USER_ID: requiredEnvString("TARGET_BOT_USER_ID"),
});
const localWorkerOrigin = "http://127.0.0.1:8792";

export type SlackSetupIo = {
  readonly commandExists?: (command: string) => boolean;
  readonly stderr?: (line: string) => void;
  readonly stdout?: (line: string) => void;
};

type ParsedArgs = {
  readonly command: "tunnel" | "webhook";
  readonly envFile: string;
  readonly publicUrl: string | undefined;
  readonly workerUrl: string | undefined;
};

export async function runSlackSetup(
  argv: readonly string[],
  io: SlackSetupIo = {},
): Promise<number> {
  const output = io.stdout ?? console.log;
  const error = io.stderr ?? console.error;
  const parsedArgs = parseArgs(argv);

  if (!parsedArgs) {
    error(
      "usage: slack.ts tunnel|webhook [--env-file .dev.vars] [--public-url https://...] [--worker-url https://...]",
    );

    return 1;
  }

  const envResult = validateRequiredEnv(loadDotEnvFile(parsedArgs.envFile));

  if (!envResult.success) {
    for (const issue of envResult.error.issues) {
      error(issue.message);
    }

    return 1;
  }

  if (parsedArgs.command === "webhook") {
    if (!parsedArgs.workerUrl) {
      error("webhook requires --worker-url https://<deployed-worker-origin>");

      return 1;
    }

    printWebhookInstructions(output, parsedArgs.workerUrl);

    return 0;
  }

  if (parsedArgs.publicUrl) {
    printTunnelInstructions(output, parsedArgs.publicUrl);

    return 0;
  }

  const commandExists = io.commandExists ?? defaultCommandExists;

  if (!commandExists("cloudflared")) {
    error("cloudflared is not available.");
    error(`Run any HTTPS tunnel manually to ${localWorkerOrigin}.`);
    error("Then set Slack's Request URL to <public-tunnel-origin>/slack/events.");

    return 1;
  }

  await runCloudflaredTunnel(output, error);

  return 0;
}

function requiredEnvString(key: string): z.ZodString {
  return z
    .string({ error: `${key} is required` })
    .trim()
    .min(1, `${key} is required`);
}

function parseArgs(argv: readonly string[]): ParsedArgs | null {
  const [command, ...rest] = argv;

  if (command !== "tunnel" && command !== "webhook") {
    return null;
  }

  return {
    command,
    envFile: readFlag(rest, "--env-file") ?? ".dev.vars",
    publicUrl: readFlag(rest, "--public-url"),
    workerUrl: readFlag(rest, "--worker-url"),
  };
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  if (index < 0) {
    return undefined;
  }

  return argv[index + 1];
}

function loadDotEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  const contents = readFileSync(path, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex < 0) {
      continue;
    }

    env[trimmed.slice(0, equalsIndex)] = trimmed.slice(equalsIndex + 1);
  }

  return env;
}

function validateRequiredEnv(env: Record<string, string>) {
  return requiredEnvSchema.safeParse(env);
}

function printTunnelInstructions(output: (line: string) => void, publicOrigin: string): void {
  output(`Slack Request URL: ${joinOrigin(publicOrigin)}/slack/events`);
  output("Slack events: message.channels, message.groups");
  output("Slack bot scopes: chat:write, channels:history, groups:history");
}

function printWebhookInstructions(output: (line: string) => void, workerOrigin: string): void {
  output(`Slack Request URL: ${joinOrigin(workerOrigin)}/slack/events`);
  output("Configure Slack App Event Subscriptions with message.channels and message.groups.");
  output("Invite the bot to every private channel that should be covered.");
}

function joinOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function defaultCommandExists(command: string): boolean {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

async function runCloudflaredTunnel(
  output: (line: string) => void,
  error: (line: string) => void,
): Promise<void> {
  output(`Starting cloudflared tunnel to ${localWorkerOrigin}`);
  const child = spawn("cloudflared", ["tunnel", "--url", localWorkerOrigin], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const match = text.match(/https:\/\/[^\s]+\.trycloudflare\.com/);

      if (match?.[0]) {
        printTunnelInstructions(output, match[0]);
      }

      output(text.trimEnd());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      error(chunk.toString("utf8").trimEnd());
    });
    child.on("error", reject);
    child.on("close", () => resolve());
  });
}

function isMain(metaUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry ? pathToFileURL(argvEntry).href === metaUrl : false;
}

if (isMain(import.meta.url, process.argv[1])) {
  runSlackSetup(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
