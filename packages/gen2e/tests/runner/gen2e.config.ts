import { defineConfig } from "../../src/config";
import { routedModel } from "../support/scripted-model";

export default defineConfig({
  model: routedModel([
    ["type {{query}} in the search box", "await page.getByTestId('search-input').fill(vars.query)"],
    ["click the button", "await page.locator('#click-button').click()"],
    [
      "the click count is 1",
      "return (await page.getByTestId('current-count').innerText()) === '1'",
    ],
    [
      "the search box says dogs",
      "return (await page.getByTestId('search-input').inputValue()) === 'dogs'",
    ],
    ["read the header", "return await page.locator('h1').innerText()"],
  ]),
  vars: { query: "cats" },
  playwright: { use: { baseURL: "http://127.0.0.1:9999" } },
});
