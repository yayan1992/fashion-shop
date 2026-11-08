import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCheckoutHandler } from "../../supabase/functions/place-order/handler.ts";
import { anon, as, createUser, enableCheckout, expectError, orderPayload, owner, pool, rpc, server, stock, type Caller } from "./db";

// The place-order Edge Function and the database rules behind it. The handler
// runs for real; its calls to the database go through as service_role, and
// Cloudflare's verification answer is supplied by each test.

const SECRET = "test-turnstile-secret";
const SKU = "HENLEY-RUST-S";
let shopper: Caller;

type Verdict = { success: boolean; action?: string };
const verifications: Record<string, string>[] = [];

/** Routes the handler's requests: Cloudflare gets a canned verdict, the database gets real calls as service_role. */
function backend(verdict: Verdict): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://challenges.cloudflare.com/")) {
      verifications.push(Object.fromEntries(init!.body as URLSearchParams));
      return Response.json(verdict);
    }
    if (new Headers(init!.headers).get("apikey") !== "server-key") return Response.json({ message: "Invalid API key" }, { status: 401 });
    const fn = url.match(/\/rest\/v1\/rpc\/([a-z_]+)$/)![1]!;
    try {
      return Response.json(await rpc(server, fn, JSON.parse(String(init!.body))));
    } catch (error) {
      const e = error as Error & { code?: string; detail?: string };
      return Response.json({ message: e.message, code: e.code, details: e.detail ?? null, hint: null }, { status: 400 });
    }
  };
}

function checkout(ip: string, body: unknown, verdict: Verdict = { success: true, action: "checkout" }, turnstileSecret = SECRET, allowTestKeys = false) {
  const handler = createCheckoutHandler({ supabaseUrl: "http://db.test", serverKey: "server-key", turnstileSecret, allowTestKeys, fetch: backend(verdict) });
  return handler(new Request("http://edge.test/place-order", { method: "POST", headers: { "x-forwarded-for": `${ip}, 10.0.0.1` }, body: JSON.stringify(body) }));
}
const orders = async () => Number((await owner<{ n: string }>("select count(*) as n from public.orders"))[0]!.n);

beforeAll(async () => {
  shopper = await createUser("shopper@protection.test");
  await enableCheckout();
});
afterAll(() => pool.end());

describe("the API cannot be used to skip the checks", () => {
  it("visitors and signed-in users cannot call place_order or the throttle directly", async () => {
    for (const caller of [anon, shopper]) {
      await expectError(rpc(caller, "place_order", { p_order: orderPayload([{ sku: SKU, quantity: 1 }]) }), "permission denied");
      await expectError(rpc(caller, "checkout_allow", { p_client: "x" }), "permission denied");
      await expectError(as(caller, "select * from private.checkout_attempts"), "permission denied");
    }
  });
});

describe("the throttle", () => {
  it("allows 5 attempts in 10 minutes per connection, and other connections are unaffected", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await rpc<boolean>(server, "checkout_allow", { p_client: "throttle-a" }));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(await rpc<boolean>(server, "checkout_allow", { p_client: "throttle-b" })).toBe(true);
  });

  it("allows 20 attempts a day per connection", async () => {
    await owner("insert into private.checkout_attempts (client, attempted_at) select 'throttle-day', now() - interval '2 hours' from generate_series(1, 20)");
    expect(await rpc<boolean>(server, "checkout_allow", { p_client: "throttle-day" })).toBe(false);
    await owner("update private.checkout_attempts set attempted_at = now() - interval '25 hours' where client = 'throttle-day'");
    expect(await rpc<boolean>(server, "checkout_allow", { p_client: "throttle-day" })).toBe(true);
  });

  it("decides parallel attempts one at a time", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => rpc<boolean>(server, "checkout_allow", { p_client: "throttle-parallel" })));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});

describe("the place-order function", () => {
  it("places a verified order, priced by the database", async () => {
    const before = await stock(SKU);
    verifications.length = 0;
    const response = await checkout("203.0.113.10", { token: "token-1", order: orderPayload([{ sku: SKU, quantity: 1, price: 1 }], { total: 1 }) });
    expect(response.status).toBe(200);
    const order = await response.json();
    expect(order).toMatchObject({ reference: expect.stringMatching(/^SF-\d+$/), total: 12000 });
    expect(await stock(SKU)).toBe(before - 1);
    // Cloudflare is asked with the secret, the token and the visitor's address.
    expect(verifications).toEqual([{ secret: SECRET, response: "token-1", remoteip: "203.0.113.10" }]);
    // The address is stored only as a keyed hash.
    expect(await owner("select 1 from private.checkout_attempts where client like '%203.0.113.10%'")).toHaveLength(0);
  });

  it("refuses an order without a token, with a failed check, or for another action, and places nothing", async () => {
    const [count, before] = [await orders(), await stock(SKU)];
    const order = orderPayload([{ sku: SKU, quantity: 1 }]);
    const missing = await checkout("203.0.113.20", { order });
    expect([missing.status, (await missing.json()).message]).toEqual([400, "verification_required"]);
    const failed = await checkout("203.0.113.20", { token: "bad", order }, { success: false });
    expect([failed.status, (await failed.json()).message]).toEqual([403, "verification_failed"]);
    const elsewhere = await checkout("203.0.113.20", { token: "login-token", order }, { success: true, action: "login" });
    expect([elsewhere.status, (await elsewhere.json()).message]).toEqual([403, "verification_failed"]);
    expect([await orders(), await stock(SKU)]).toEqual([count, before]);
  });

  it("stays closed when no Turnstile secret is configured", async () => {
    const response = await checkout("203.0.113.30", { token: "t", order: orderPayload([{ sku: SKU, quantity: 1 }]) }, undefined, "");
    expect([response.status, (await response.json()).message]).toEqual([503, "checkout_protection_not_configured"]);
  });

  it("never treats Cloudflare's test secrets as protection unless a test project opts in", async () => {
    const order = { token: "XXXX.DUMMY.TOKEN.XXXX", order: orderPayload([{ sku: SKU, quantity: 1 }]) };
    for (const secret of ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"]) {
      const refused = await checkout("203.0.113.50", order, undefined, secret);
      expect([refused.status, (await refused.json()).message]).toEqual([503, "checkout_protection_not_configured"]);
    }
    expect((await checkout("203.0.113.51", order, undefined, "1x0000000000000000000000000000000AA", true)).status).toBe(200);
  });

  it("passes database refusals through unchanged, so the store can correct the bag", async () => {
    const response = await checkout("203.0.113.40", { token: "t", order: orderPayload([{ sku: SKU, quantity: 10 }, { sku: "NO-SUCH-SKU", quantity: 1 }]) });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("unknown_item");
    const short = await checkout("203.0.113.40", { token: "t", order: orderPayload([{ sku: SKU, quantity: 10 }]) });
    const body = await short.json();
    expect(body.message).toBe("insufficient_stock");
    expect(JSON.parse(body.details)[0]).toMatchObject({ sku: SKU, requested: 10 });
  });

  it("slows a flood from one connection to 5 attempts, verified or not", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await checkout("198.51.100.7", { token: "t", order: orderPayload([{ sku: "NO-SUCH-SKU", quantity: 1 }]) }, { success: false })).status);
    expect(statuses).toEqual([403, 403, 403, 403, 403, 429, 429]);
    expect((await checkout("198.51.100.8", { token: "t", order: orderPayload([{ sku: SKU, quantity: 1 }]) })).status).toBe(200);
  });
});
