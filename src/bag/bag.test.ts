import { describe, expect, it } from "vitest";
import { localCatalog } from "@/catalog/local";
import { bagCount, bagReducer, bagSubtotal, reconcile } from "./bag";

const catalog = localCatalog;
const reduce = bagReducer.bind(null, catalog);

describe("bag", () => {
  it("adds a line and merges repeat adds", () => {
    let lines = reduce([], { type: "add", sku: "HEAVYWEIGHT-TEE-BONE-M" });
    lines = reduce(lines, { type: "add", sku: "HEAVYWEIGHT-TEE-BONE-M" });
    expect(lines).toEqual([{ sku: "HEAVYWEIGHT-TEE-BONE-M", quantity: 2 }]);
    expect(bagCount(lines)).toBe(2);
    expect(bagSubtotal(catalog, lines)).toBe(17000);
  });

  it("never exceeds stock", () => {
    // Lambswool cardigan, moss, L has one left.
    let lines = reduce([], { type: "add", sku: "LAMBSWOOL-CARDIGAN-MOSS-L" });
    lines = reduce(lines, { type: "add", sku: "LAMBSWOOL-CARDIGAN-MOSS-L" });
    expect(lines).toEqual([{ sku: "LAMBSWOOL-CARDIGAN-MOSS-L", quantity: 1 }]);
    expect(reduce(lines, { type: "set", sku: "LAMBSWOOL-CARDIGAN-MOSS-L", quantity: 9 })[0]?.quantity).toBe(1);
  });

  it("ignores sold-out and unknown variants", () => {
    expect(reduce([], { type: "add", sku: "HEAVYWEIGHT-TEE-BLACK-M" })).toEqual([]);
    expect(reduce([], { type: "add", sku: "NOT-A-SKU" })).toEqual([]);
  });

  it("removes a line when its quantity is set to zero", () => {
    const lines = reduce([], { type: "add", sku: "HENLEY-RUST-M" });
    expect(reduce(lines, { type: "set", sku: "HENLEY-RUST-M", quantity: 0 })).toEqual([]);
  });

  it("reconciles stored bags against the catalogue", () => {
    const stored = [{ sku: "HEAVYWEIGHT-TEE-BONE-XL", quantity: 50 }, { sku: "GONE", quantity: 1 }, { sku: 3 }, null];
    expect(reconcile(catalog, stored)).toEqual([{ sku: "HEAVYWEIGHT-TEE-BONE-XL", quantity: 3 }]);
    expect(reconcile(catalog, "garbage")).toEqual([]);
  });
});
