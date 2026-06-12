import { parseWorkerEnv } from "./config";
import type { SlackTransport } from "./slack/client";
import { type MessageDedupeNamespace, processSlackHandoff } from "./slack/handoff-handler";
import { handleSlackEventsRequest } from "./slack/http";

export { MessageDedupeObject } from "./dedupe-object";

type WorkerRuntimeEnv<TId> = {
  readonly HANDOFF_MESSAGE_TEMPLATE?: string;
  readonly MESSAGE_DEDUPE: MessageDedupeNamespace<TId>;
  readonly OWNER_USER_ID: string;
  readonly SLACK_BOT_TOKEN: string;
  readonly SLACK_SIGNING_SECRET: string;
  readonly TARGET_BOT_USER_ID: string;
};

export type WorkerDependencies = {
  readonly nowSeconds?: () => number;
  readonly slackApiBaseUrl?: string;
  readonly slackTransport?: SlackTransport;
};

export type SlackHandoffWorker<TId> = {
  fetch(request: Request, env: WorkerRuntimeEnv<TId>): Promise<Response>;
};

export function createWorker<TId = DurableObjectId>(
  dependencies: WorkerDependencies = {},
): SlackHandoffWorker<TId> {
  return {
    async fetch(request: Request, env: WorkerRuntimeEnv<TId>): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }

      if (url.pathname !== "/slack/events") {
        return new Response("not found", { status: 404 });
      }

      const configResult = parseWorkerEnv(env);

      if (configResult.kind === "invalid") {
        return new Response("worker configuration invalid", { status: 500 });
      }

      return handleSlackEventsRequest(request, {
        nowSeconds: dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1000)),
        onEventCallback: (callback) =>
          processSlackHandoff({
            callback,
            config: configResult.config,
            dedupeNamespace: env.MESSAGE_DEDUPE,
            ...(dependencies.slackApiBaseUrl === undefined
              ? {}
              : { slackApiBaseUrl: dependencies.slackApiBaseUrl }),
            ...(dependencies.slackTransport === undefined
              ? {}
              : { slackTransport: dependencies.slackTransport }),
          }),
        signingSecret: configResult.config.SLACK_SIGNING_SECRET,
      });
    },
  };
}

const worker = createWorker() satisfies ExportedHandler<WorkerRuntimeEnv<DurableObjectId>>;

// biome-ignore lint/style/noDefaultExport: Cloudflare module workers require the entrypoint as default export.
export default worker;
