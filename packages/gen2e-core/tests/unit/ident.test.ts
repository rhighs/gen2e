import { expect, test } from "bun:test";
import { hashBasedIdent } from "../../src/ident";

test("hashBasedIdent is the MD5 of the default identifier", () => {
  expect(hashBasedIdent("executes query", "get the header text")).toBe(
    "3d7fc078d76f200cf50ad1639733734e",
  );
});
