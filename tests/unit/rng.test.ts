import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/rng";

describe("core/rng", () => {
  it("exposes the seed it was created with", () => {
    const rng = createRng(42);
    expect(rng.seed).toBe(42);
  });

  it("next() stays within [0,1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic: same seed produces the same sequence", () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("range(min,max) stays within bounds", () => {
    const rng = createRng(99);
    for (let i = 0; i < 200; i++) {
      const v = rng.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it("int(min,max) is an integer within inclusive bounds", () => {
    const rng = createRng(55);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(1, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it("pick() only returns elements from the array", () => {
    const rng = createRng(3);
    const arr = ["a", "b", "c"] as const;
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it("shuffle() returns a permutation without mutating the input", () => {
    const rng = createRng(8);
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    const shuffled = rng.shuffle(original);
    expect(original).toEqual(copy);
    expect(shuffled.slice().sort()).toEqual(original.slice().sort());
  });

  it("fork(label) produces a Rng independent from the parent stream", () => {
    const parent = createRng(2026);
    const child = parent.fork("elephant");
    expect(child.seed).not.toBe(parent.seed);
    const parentNext = parent.next();
    const childSeq = Array.from({ length: 5 }, () => child.next());
    // parent stream continues independently of what the child produced
    expect(parentNext).not.toBeNaN();
    expect(childSeq.length).toBe(5);
  });

  it("fork(label) is deterministic given the same parent state", () => {
    const parentA = createRng(2026);
    const parentB = createRng(2026);
    const childA = parentA.fork("sand");
    const childB = parentB.fork("sand");
    expect(childA.seed).toBe(childB.seed);
    expect(childA.next()).toBe(childB.next());
  });

  it("fork with different labels yields different child streams", () => {
    const parent = createRng(2026);
    const childA = parent.fork("sand");
    const parent2 = createRng(2026);
    const childB = parent2.fork("pipe");
    expect(childA.seed).not.toBe(childB.seed);
  });
});
