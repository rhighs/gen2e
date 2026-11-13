import { defaultMakeIdent, hashBasedIdent } from "../../../src/static/ident";

describe("hashBasedIdent", () => {
  const testTitle = "executes query";
  const task = "get the header text";

  test("should differ from the default identifier", () => {
    expect(hashBasedIdent(testTitle, task)).not.toBe(defaultMakeIdent(testTitle, task));
  });

  test("should be stable across calls", () => {
    expect(hashBasedIdent(testTitle, task)).toBe(hashBasedIdent(testTitle, task));
  });

  test("should be the MD5 hash of the default identifier", () => {
    expect(hashBasedIdent(testTitle, task)).toBe("3d7fc078d76f200cf50ad1639733734e");
  });
});
