import { describe, expect, it } from "vitest";
import {
  assertMarketingEligible,
  extractTemplateVariables,
  renderTemplatePreview,
} from "@/lib/whatsapp";

describe("assertMarketingEligible", () => {
  const base = {
    phone: "+201000000000",
    whatsappOptIn: true,
    marketingPaused: false,
    unsubscribed: false,
  };

  it("passes an opted-in, subscribed contact", () => {
    expect(assertMarketingEligible(base)).toBeNull();
  });

  it("rejects in priority order: phone, opt-in, unsubscribed, paused", () => {
    expect(assertMarketingEligible({ ...base, phone: null })).toBe(
      "missing_phone",
    );
    expect(assertMarketingEligible({ ...base, whatsappOptIn: false })).toBe(
      "missing_whatsapp_opt_in",
    );
    expect(assertMarketingEligible({ ...base, unsubscribed: true })).toBe(
      "unsubscribed",
    );
    expect(assertMarketingEligible({ ...base, marketingPaused: true })).toBe(
      "marketing_paused",
    );
  });
});

describe("extractTemplateVariables", () => {
  it("extracts numeric placeholders sorted numerically", () => {
    const components = [
      { type: "BODY", text: "Hi {{1}}, your order {{2}} is ready." },
    ];
    expect(extractTemplateVariables(components)).toEqual(["1", "2"]);
  });

  it("de-duplicates repeated placeholders", () => {
    expect(
      extractTemplateVariables("Hello {{name}}, bye {{name}}"),
    ).toEqual(["name"]);
  });

  it("returns an empty array when there are no placeholders", () => {
    expect(extractTemplateVariables("static text")).toEqual([]);
  });
});

describe("renderTemplatePreview", () => {
  it("substitutes provided variables and leaves unknowns intact", () => {
    const body = { body: "Hi {{1}}, code {{2}}" };
    expect(renderTemplatePreview(body, { "1": "Sara" })).toBe(
      "Hi Sara, code {{2}}",
    );
  });
});
