import { z } from "zod";

export interface DedupeStorage {
  transaction<T>(closure: (txn: DedupeTransaction) => Promise<T>): Promise<T>;
}

export interface DedupeTransaction {
  delete(key: string): Promise<void>;
  get(key: string): Promise<boolean | undefined>;
  put(key: string, value: boolean): Promise<void>;
}

const claimRequestSchema = z.object({
  action: z.enum(["claim", "release"]).default("claim"),
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

// Frees a claim so a retry can re-attempt delivery. Used to compensate when the
// Slack post fails after the claim was taken, preventing silent message loss.
export async function releaseSlackMessageClaim(
  storage: DedupeStorage,
  key: string
): Promise<void> {
  await storage.transaction((txn) => txn.delete(key));
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

    if (payload.data.action === "release") {
      await releaseSlackMessageClaim(this.state.storage, payload.data.key);

      return Response.json({ released: true });
    }

    const claimed = await claimSlackMessageOnce(
      this.state.storage,
      payload.data.key
    );

    return Response.json({ claimed });
  }
}
