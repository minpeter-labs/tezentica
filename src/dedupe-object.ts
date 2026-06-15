import { z } from "zod";

export interface DedupeStorage {
  transaction<T>(closure: (txn: DedupeTransaction) => Promise<T>): Promise<T>;
}

export interface DedupeTransaction {
  get(key: string): Promise<boolean | undefined>;
  put(key: string, value: boolean): Promise<void>;
}

const claimRequestSchema = z.object({
  key: z.string().trim().min(1),
});

export async function claimSlackMessageOnce(
  storage: DedupeStorage,
  key: string
): Promise<boolean> {
  return await storage.transaction(async (txn) => {
    const existing = await txn.get(key);

    if (existing) {
      return false;
    }

    await txn.put(key, true);

    return true;
  });
}

export class MessageDedupeObject implements DurableObject {
  private readonly state: { readonly storage: DedupeStorage };

  constructor(state: { readonly storage: DedupeStorage }) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const payload = claimRequestSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!payload.success) {
      return new Response("invalid claim request", { status: 400 });
    }

    const claimed = await claimSlackMessageOnce(
      this.state.storage,
      payload.data.key
    );

    return Response.json({ claimed });
  }
}
