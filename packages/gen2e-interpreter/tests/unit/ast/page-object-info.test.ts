import { describe, expect, test } from "bun:test";
import { pageObjectsInfo } from "../../../src/ast/page-object-info";

describe("pageObjectsInfo", () => {
  test("reads the tagged constants and method signatures of a named class", () => {
    const src = `
      export class LoginPage {
        gen2e_const_pageUrl = "https://example.com/login";
        gen2e_const_description = "the login form";

        async signIn(user: string, password: string): Promise<void> {}
      }
    `;

    expect(pageObjectsInfo(src)).toEqual([
      {
        className: "LoginPage",
        pageUrl: "https://example.com/login",
        description: "the login form",
        methods: [
          {
            name: "signIn",
            params: ["user: string", "password: string"],
            returnType: "Promise<void>",
          },
        ],
      },
    ]);
  });

  test("skips anonymous classes", () => {
    const src = `
      export default class {
        gen2e_const_pageUrl = "https://example.com";
      }
    `;

    expect(pageObjectsInfo(src)).toEqual([]);
  });
});
