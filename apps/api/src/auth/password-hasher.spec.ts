/// <reference types="jest" />
import * as bcrypt from "bcrypt";
import {
  hashPassword,
  needsRehash,
  resolveBcryptCost,
  verifyPassword,
  withSlot,
} from "./password-hasher.js";

describe("password hasher", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to cost 10 and clamps BCRYPT_COST to 10..14", () => {
    expect(resolveBcryptCost({} as never)).toBe(10);
    expect(resolveBcryptCost({ BCRYPT_COST: "12" } as never)).toBe(12);
    expect(resolveBcryptCost({ BCRYPT_COST: "4" } as never)).toBe(10);
    expect(resolveBcryptCost({ BCRYPT_COST: "20" } as never)).toBe(14);
  });

  it("hashes at the configured cost and verifies", async () => {
    const hash = await hashPassword("correct horse");
    expect(bcrypt.getRounds(hash)).toBe(10);
    await expect(verifyPassword("correct horse", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("verifies legacy cost-12 hashes and flags them for rehash", async () => {
    const legacy = await bcrypt.hash("legacy-pass", 12);
    await expect(verifyPassword("legacy-pass", legacy)).resolves.toBe(true);
    expect(needsRehash(legacy)).toBe(true);
    expect(needsRehash(await hashPassword("x"))).toBe(false);
    expect(needsRehash("not-a-bcrypt-hash")).toBe(false);
  });

  it("runs at most BCRYPT_MAX_CONCURRENCY operations at once, in order", async () => {
    process.env.BCRYPT_MAX_CONCURRENCY = "1";
    let concurrent = 0;
    let peak = 0;
    const order: number[] = [];
    const task = (id: number) =>
      withSlot(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(id);
        concurrent -= 1;
        return id;
      });

    await expect(Promise.all([1, 2, 3, 4, 5].map(task))).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(1);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("releases the slot when a task throws", async () => {
    process.env.BCRYPT_MAX_CONCURRENCY = "1";
    await expect(withSlot(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(withSlot(async () => "next")).resolves.toBe("next");
  });
});
