import { describe, expect, it } from "vitest";
import { isWithinQuietHours } from "@/services/campaign-service";
import { isOutsideBusinessHours } from "@/services/automation-service";

// A fixed instant: 2026-06-25T22:30:00Z → 22:30 UTC.
const at = (iso: string) => new Date(iso);

describe("isWithinQuietHours", () => {
  it("returns false when start and end are missing", () => {
    expect(isWithinQuietHours(null, null, "UTC")).toBe(false);
  });

  it("detects an overnight quiet window (21:00–09:00)", () => {
    // 22:30 UTC is inside 21:00–09:00.
    expect(
      isWithinQuietHours("21:00", "09:00", "UTC", at("2026-06-25T22:30:00Z")),
    ).toBe(true);
    // 12:00 UTC is outside the overnight window.
    expect(
      isWithinQuietHours("21:00", "09:00", "UTC", at("2026-06-25T12:00:00Z")),
    ).toBe(false);
  });

  it("handles a same-day window (09:00–17:00)", () => {
    expect(
      isWithinQuietHours("09:00", "17:00", "UTC", at("2026-06-25T12:00:00Z")),
    ).toBe(true);
    expect(
      isWithinQuietHours("09:00", "17:00", "UTC", at("2026-06-25T18:00:00Z")),
    ).toBe(false);
  });

  it("treats an empty window (start === end) as never quiet", () => {
    expect(
      isWithinQuietHours("09:00", "09:00", "UTC", at("2026-06-25T09:00:00Z")),
    ).toBe(false);
  });
});

describe("isOutsideBusinessHours", () => {
  it("is the inverse of being inside the business window", () => {
    // Business hours 09:00–17:00 UTC.
    expect(
      isOutsideBusinessHours("09:00", "17:00", "UTC", at("2026-06-25T12:00:00Z")),
    ).toBe(false);
    expect(
      isOutsideBusinessHours("09:00", "17:00", "UTC", at("2026-06-25T20:00:00Z")),
    ).toBe(true);
  });

  it("supports overnight business windows", () => {
    // Open 20:00–04:00 (overnight). 22:00 is open, 12:00 is closed.
    expect(
      isOutsideBusinessHours("20:00", "04:00", "UTC", at("2026-06-25T22:00:00Z")),
    ).toBe(false);
    expect(
      isOutsideBusinessHours("20:00", "04:00", "UTC", at("2026-06-25T12:00:00Z")),
    ).toBe(true);
  });
});
