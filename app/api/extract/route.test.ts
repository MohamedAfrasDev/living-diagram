import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { release, tryAcquire } from "../../../lib/busy";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

const KEY = "sk-test-key-that-must-not-leak-1234567890";
const saved = { key: process.env.MODEL_API_KEY, flag: process.env.REPLAY_ONLY };
beforeEach(() => {
  delete process.env.MODEL_API_KEY;
  delete process.env.REPLAY_ONLY;
  release();
});
afterEach(() => {
  release();
  if (saved.key === undefined) delete process.env.MODEL_API_KEY;
  else process.env.MODEL_API_KEY = saved.key;
  if (saved.flag === undefined) delete process.env.REPLAY_ONLY;
  else process.env.REPLAY_ONLY = saved.flag;
});

describe("/api/extract guards", () => {
  test("REPLAY_ONLY wins over everything, even a valid body with a key, and never echoes the key", async () => {
    process.env.MODEL_API_KEY = KEY;
    process.env.REPLAY_ONLY = "1";
    const res = await post({ text: "Payment runs 12 workers." });
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).code).toBe("REPLAY_ONLY");
    expect(text).not.toContain("sk-test-key");
  });

  test("without a key it answers 503 NO_API_KEY", async () => {
    const res = await post({ text: "Payment runs 12 workers." });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NO_API_KEY");
  });

  test("missing, empty, blank, non-string and over-long text are INVALID_BODY", async () => {
    process.env.MODEL_API_KEY = KEY;
    for (const body of [{}, { text: "" }, { text: "   \n " }, { text: 5 }, { text: "x".repeat(6001) }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_BODY");
    }
  });

  test("a body that is not JSON is INVALID_BODY", async () => {
    process.env.MODEL_API_KEY = KEY;
    const res = await POST(new Request("http://localhost/api/extract", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_BODY");
  });

  test("text of exactly 6000 characters passes the body check (it is then busy, so no network call is made)", async () => {
    process.env.MODEL_API_KEY = KEY;
    expect(tryAcquire()).toBe(true);
    const res = await post({ text: "x".repeat(6000) });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUSY");
  });

  test("only one model request at a time", async () => {
    process.env.MODEL_API_KEY = KEY;
    expect(tryAcquire()).toBe(true);
    const res = await post({ text: "Payment runs 12 workers." });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUSY");
  });
});
