import { expect, test } from "vitest";
import { hello } from "./hello";

test("hello-world: toolchain runs", () => {
  expect(hello("world")).toBe("hello, world");
});
