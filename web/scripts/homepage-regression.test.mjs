import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOME_NAVIGATION_IDS, nextHomepageTabIndex, resolveHomeLocale } from "../src/landing-model.ts";

function missingContracts(file, source, contracts) {
  return contracts.filter((contract) => !source.includes(contract)).map((contract) => `${file} missing ${contract}`);
}

const brokenFixture = missingContracts("broken.tsx", "<main />", ["onLogin", "onSignup", "<details"]);
if (brokenFixture.length !== 3) throw new Error(`Homepage regression negative self-test failed: expected 3 issues, received ${brokenFixture.length}`);

test("stored homepage locale wins only when it is supported", () => {
  assert.equal(resolveHomeLocale("sn", "en-GB"), "sn");
  assert.equal(resolveHomeLocale("nd", "sn-ZW"), "nd");
  assert.equal(resolveHomeLocale("fr", "sn-ZW"), "sn");
  assert.equal(resolveHomeLocale("", "nd-ZW"), "nd");
  assert.equal(resolveHomeLocale(null, "fr-FR"), "en");
});

test("homepage tab keys wrap and ignore unrelated keys safely", () => {
  assert.equal(nextHomepageTabIndex("ArrowRight", 5, 6), 0);
  assert.equal(nextHomepageTabIndex("ArrowLeft", 0, 6), 5);
  assert.equal(nextHomepageTabIndex("Home", 4, 6), 0);
  assert.equal(nextHomepageTabIndex("End", 1, 6), 5);
  assert.equal(nextHomepageTabIndex("Tab", 1, 6), null);
  assert.equal(nextHomepageTabIndex("ArrowRight", -1, 6), null);
  assert.equal(nextHomepageTabIndex("ArrowRight", 0, 0), null);
});

test("homepage navigation retains real section targets", () => {
  assert.deepEqual(HOME_NAVIGATION_IDS, ["product", "outcomes", "why", "pricing", "faq"]);
});

test("homepage source protects access, interaction and honest availability contracts", async () => {
  const [landing, copy, styles] = await Promise.all([
    readFile("src/landing.tsx", "utf8"),
    readFile("src/locales/home.en.ts", "utf8"),
    readFile("src/landing.css", "utf8"),
  ]);

  const issues = [
    ...missingContracts("src/landing.tsx", landing, [
      "onClick={onLogin}",
      "onSignup();",
      'aria-expanded={menuOpen}',
      'aria-controls="mobile-navigation"',
      'role="tablist"',
      'role="tabpanel"',
      "nextHomepageTabIndex(event.key",
      "<details",
      "resolveHomeLocale(event.target.value",
    ]),
    ...missingContracts("src/locales/home.en.ts", copy, [
      'sample: "Illustrative product preview"',
      'live: "Sample view"',
      'notice: "Concept preview only. VAKA AI is not available in the live product."',
      'question: "Does VAKA include payroll?"',
      "Payroll is planned and is not yet available in the live product.",
      "Start with a 30-day free trial.",
      '{ name: "Starter", price: "$19"',
      '{ name: "Growth", price: "$69"',
      '{ name: "Business", price: "$249"',
      '{ name: "Enterprise", price: "$599+"',
      "Verified ChiShona and isiNdebele translations are in review. Showing English for now.",
    ]),
    ...missingContracts("src/landing.css", styles, [
      "overflow-x: clip",
      ".v-button {",
      "min-height: 50px",
      "@media (max-width: 1050px)",
      "@media (max-width: 760px)",
      "@media (max-width: 460px)",
      "@media (prefers-reduced-motion: reduce)",
    ]),
  ];

  assert.deepEqual(issues, []);
});
