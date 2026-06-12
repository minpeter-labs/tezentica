import { z } from "zod";

function requiredEnvString(key: string): z.ZodString {
  return z
    .string({ error: `${key} is required` })
    .trim()
    .min(1, `${key} is required`);
}

const workerEnvSchema = z.object({
  HANDOFF_MESSAGE_TEMPLATE: z.string().trim().min(1).optional(),
  OWNER_USER_ID: requiredEnvString("OWNER_USER_ID"),
  SLACK_BOT_TOKEN: requiredEnvString("SLACK_BOT_TOKEN"),
  SLACK_SIGNING_SECRET: requiredEnvString("SLACK_SIGNING_SECRET"),
  TARGET_BOT_USER_ID: requiredEnvString("TARGET_BOT_USER_ID"),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export type ConfigParseResult =
  | {
      readonly config: WorkerConfig;
      readonly kind: "valid";
    }
  | {
      readonly issues: readonly string[];
      readonly kind: "invalid";
    };

export function parseWorkerEnv(env: unknown): ConfigParseResult {
  const result = workerEnvSchema.safeParse(env);

  if (result.success) {
    return {
      config: result.data,
      kind: "valid",
    };
  }

  return {
    issues: result.error.issues.map((issue) => issue.message),
    kind: "invalid",
  };
}
