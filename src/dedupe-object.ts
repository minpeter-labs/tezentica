import { z } from "zod";

export type DedupeStorage = {
  transaction<T>(closure: (txn: DedupeTransaction) => Promise<T>): Promise<T>;
};

export type DedupeTransaction = {
  get(key: string): Promise<boolean | undefined>;
  put(key: string, value: boolean): Promise<void>;
};

const claimRequestSchema = z.object({
  key: z.string().trim().min(1),
});

export async function claimSlackMessageOnce(storage: DedupeStorage, key: string): Promise<boolean> {
  return storage.transaction(async (txn) => {
    const existing = await txn.get(key);

    if (existing) {
      return false;
    }

    await txn.put(key, true);

    return true;
  });
}

export class MessageDedupeObject implements DurableObject {
  constructor(private readonly state: { readonly storage: DedupeStorage }) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const payload = claimRequestSchema.safeParse(await request.json().catch(() => null));

    if (!payload.success) {
      return new Response("invalid claim request", { status: 400 });
    }

    const claimed = await claimSlackMessageOnce(this.state.storage, payload.data.key);

    return Response.json({ claimed });
  }
}
