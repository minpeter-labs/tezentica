export class MessageDedupeObject implements DurableObject {
  async fetch(): Promise<Response> {
    return Response.json({ ok: true });
  }
}
