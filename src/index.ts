const worker = {
  async fetch(): Promise<Response> {
    return new Response("ok");
  },
} satisfies ExportedHandler;

export { MessageDedupeObject } from "./dedupe-object";

// biome-ignore lint/style/noDefaultExport: Cloudflare module workers require the entrypoint as default export.
export default worker;
