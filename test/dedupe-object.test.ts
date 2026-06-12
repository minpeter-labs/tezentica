import { describe, expect, it } from "vitest";

import { claimSlackMessageOnce, MessageDedupeObject } from "../src/dedupe-object";

describe("claimSlackMessageOnce", () => {
  it("allows only the first delivery for a Slack message key", async () => {
    const storage = new InMemoryDedupeStorage();

    const first = await claimSlackMessageOnce(storage, "T123:C123:1710000000.000100");
    const second = await claimSlackMessageOnce(storage, "T123:C123:1710000000.000100");

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("allows only one concurrent delivery for a Slack message key", async () => {
    const storage = new InMemoryDedupeStorage();

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimSlackMessageOnce(storage, "T123:C123:1710000000.000100"),
      ),
    );

    expect(results.filter((result) => result)).toHaveLength(1);
  });
});

describe("MessageDedupeObject", () => {
  it("accepts a claim request and rejects duplicate claims", async () => {
    const object = new MessageDedupeObject({ storage: new InMemoryDedupeStorage() });

    const first = await object.fetch(createClaimRequest("T123:C123:1710000000.000100"));
    const second = await object.fetch(createClaimRequest("T123:C123:1710000000.000100"));

    expect(await first.json()).toEqual({ claimed: true });
    expect(await second.json()).toEqual({ claimed: false });
  });

  it("rejects malformed claim requests", async () => {
    const object = new MessageDedupeObject({ storage: new InMemoryDedupeStorage() });
    const response = await object.fetch(
      new Request("https://dedupe.example/claim", {
        body: JSON.stringify({ key: "" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });
});

function createClaimRequest(key: string): Request {
  return new Request("https://dedupe.example/claim", {
    body: JSON.stringify({ key }),
    method: "POST",
  });
}

class InMemoryDedupeStorage {
  readonly seen = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

  transaction<T>(closure: (txn: InMemoryDedupeTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => closure(new InMemoryDedupeTransaction(this.seen)));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
}

class InMemoryDedupeTransaction {
  constructor(private readonly seen: Set<string>) {}

  async get(key: string): Promise<boolean | undefined> {
    return this.seen.has(key) ? true : undefined;
  }

  async put(key: string, value: boolean): Promise<void> {
    if (value) {
      this.seen.add(key);
    }
  }
}
