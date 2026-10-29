import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

const saved = { key: process.env.MODEL_API_KEY, flag: process.env.REPLAY_ONLY };
beforeEach(() => {
  delete process.env.MODEL_API_KEY;
  delete process.env.REPLAY_ONLY;
});
afterEach(() => {
  if (saved.key === undefined) delete process.env.MODEL_API_KEY;
  else process.env.MODEL_API_KEY = saved.key;
  if (saved.flag === undefined) delete process.env.REPLAY_ONLY;
  else process.env.REPLAY_ONLY = saved.flag;
});

describe("/api/agent guards", () => {
  test("without a key it answers 503 NO_API_KEY", async () => {
    const res = await post({ question: "hi" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NO_API_KEY");
  });

  test("REPLAY_ONLY wins even when a key is present, and never echoes the key", async () => {
    process.env.MODEL_API_KEY = "sk-test-key-that-must-not-leak-1234567890";
    process.env.REPLAY_ONLY = "1";
    const res = await post({ question: "Checkout is failing. Fix it." });
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).code).toBe("REPLAY_ONLY");
    expect(text).not.toContain("sk-test-key");
  });

  test("REPLAY_ONLY also blocks malformed requests the same way (no information from the body)", async () => {
    process.env.MODEL_API_KEY = "sk-test-key-that-must-not-leak-1234567890";
    process.env.REPLAY_ONLY = "true";
    const res = await post({});
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("REPLAY_ONLY");
  });

  test("a falsy flag does not block: with a key, a bad body is rejected as INVALID_BODY, not as replay-only", async () => {
    process.env.MODEL_API_KEY = "sk-test-key-that-must-not-leak-1234567890";
    process.env.REPLAY_ONLY = "0";
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_BODY");
  });
});
