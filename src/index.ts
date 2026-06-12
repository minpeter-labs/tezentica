export const handler = {
  async fetch(): Promise<Response> {
    return new Response("ok");
  },
} satisfies ExportedHandler;
