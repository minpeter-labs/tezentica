import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { z } from "zod";

const LINE_BREAK_PATTERN = /\r?\n/;
const TRAILING_SLASHES_PATTERN = /\/+$/;

const requiredEnvSchema = z.object({
  OWNER_USER_ID: requiredEnvString("OWNER_USER_ID"),
  SLACK_BOT_TOKEN: requiredEnvString("SLACK_BOT_TOKEN"),
  SLACK_SIGNING_SECRET: requiredEnvString("SLACK_SIGNING_SECRET"),
  TARGET_BOT_USER_ID: requiredEnvString("TARGET_BOT_USER_ID"),
});
export interface SlackSetupIo {
  readonly stderr?: (line: string) => void;
  readonly stdout?: (line: string) => void;
}

interface ParsedArgs {
  readonly command: "webhook";
  readonly envFile: string;
  readonly workerUrl: string | undefined;
}

export function runSlackSetup(
  argv: readonly string[],
  io: SlackSetupIo = {}
): number {
  const output = io.stdout ?? console.log;
  const error = io.stderr ?? console.error;
  const parsedArgs = parseArgs(argv);

  if (!parsedArgs) {
    error(
      "usage: slack.ts webhook [--env-file .dev.vars] --worker-url https://..."
    );
    error(
      "Slack Event Subscriptions support one active Request URL; use the deployed Worker URL."
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

  if (!parsedArgs.workerUrl) {
    error("webhook requires --worker-url https://<deployed-worker-origin>");

    return 1;
  }

  printWebhookInstructions(output, parsedArgs.workerUrl);

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

  if (command !== "webhook") {
    return null;
  }

  return {
    command,
    envFile: readFlag(rest, "--env-file") ?? ".dev.vars",
    workerUrl: readFlag(rest, "--worker-url"),
  };
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  if (index < 0) {
    return;
  }

  return argv[index + 1];
}

function loadDotEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  const contents = readFileSync(path, "utf8");

  for (const line of contents.split(LINE_BREAK_PATTERN)) {
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

function printWebhookInstructions(
  output: (line: string) => void,
  workerOrigin: string
): void {
  output(`Slack Request URL: ${joinOrigin(workerOrigin)}/slack/events`);
  output(
    "Configure Slack App Event Subscriptions with message.channels and message.groups."
  );
  output("Invite the bot to every private channel that should be covered.");
}

function joinOrigin(origin: string): string {
  return origin.replace(TRAILING_SLASHES_PATTERN, "");
}

function isMain(metaUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry ? pathToFileURL(argvEntry).href === metaUrl : false;
}

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = runSlackSetup(process.argv.slice(2));
}
