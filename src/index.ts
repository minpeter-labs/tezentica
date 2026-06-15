import { parseWorkerEnv } from "./config";
import { MessageDedupeObject as MessageDedupeDurableObject } from "./dedupe-object";
import type { SlackTransport } from "./slack/client";
import {
  type MessageDedupeNamespace,
  processSlackHandoff,
} from "./slack/handoff-handler";
import { handleSlackEventsRequest } from "./slack/http";

// Re-export the Durable Object class so the Workers runtime can bind it from
// the entry module. Routed through a local binding to keep the entry compatible
// with both noBarrelFile (no `export ... from`) and noExportedImports.
export const MessageDedupeObject = MessageDedupeDurableObject;

interface WorkerRuntimeEnv<TId> {
  readonly ALERT_CHANNEL_IDS?: string;
  readonly HANDOFF_MESSAGE_TEMPLATE?: string;
  readonly HOME_CHANNEL_ID: string;
  readonly MESSAGE_DEDUPE: MessageDedupeNamespace<TId>;
  readonly OWNER_USER_ID: string;
  readonly SLACK_BOT_TOKEN: string;
  readonly SLACK_BOT_USER_ID?: string;
  readonly SLACK_SIGNING_SECRET: string;
  readonly TARGET_BOT_USER_ID: string;
}

export interface WorkerDependencies {
  readonly nowSeconds?: () => number;
  readonly slackApiBaseUrl?: string;
  readonly slackTransport?: SlackTransport;
}

export interface SlackHandoffWorker<TId> {
  fetch(request: Request, env: WorkerRuntimeEnv<TId>): Promise<Response>;
}

export function createWorker<TId = DurableObjectId>(
  dependencies: WorkerDependencies = {}
): SlackHandoffWorker<TId> {
  return {
    async fetch(
      request: Request,
      env: WorkerRuntimeEnv<TId>
    ): Promise<Response> {
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

      try {
        return await handleSlackEventsRequest(request, {
          nowSeconds:
            dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1000)),
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
      } catch (error) {
        // Surface a 5xx so Slack retries. The dedupe claim is released on
        // failure (see processSlackHandoff), so the retry can re-deliver
        // instead of the handoff being silently dropped.
        console.error("slack handoff processing failed", error);

        return new Response("handoff processing failed", { status: 500 });
      }
    },
  };
}

const worker = createWorker() satisfies ExportedHandler<
  WorkerRuntimeEnv<DurableObjectId>
>;

export default worker;
