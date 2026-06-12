import { parseWorkerEnv } from "./config";
import { handleSlackEventsRequest } from "./slack/http";

export { MessageDedupeObject } from "./dedupe-object";

const worker = {
  async fetch(request: Request, env: unknown): Promise<Response> {
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
      nowSeconds: () => Math.floor(Date.now() / 1000),
      signingSecret: configResult.config.SLACK_SIGNING_SECRET,
    });
  },
} satisfies ExportedHandler;

// biome-ignore lint/style/noDefaultExport: Cloudflare module workers require the entrypoint as default export.
export default worker;
