import { describe, expect, it } from "vitest";
import { buildContactWhereFromRules } from "@/services/campaign-service";

describe("buildContactWhereFromRules", () => {
  it("scopes by organization and leaves optional filters undefined", () => {
    const where = buildContactWhereFromRules({}, "org-1");
    expect(where.organizationId).toBe("org-1");
    expect(where.tags).toBeUndefined();
    expect(where.status).toBeUndefined();
    expect(where.channel).toBeUndefined();
    expect(where.assignedAgentId).toBeUndefined();
  });

  it("maps tags, statuses and channels into Prisma filters", () => {
    const where = buildContactWhereFromRules(
      {
        tags: ["vip", "pricing"],
        status: ["active", "pending"],
        channel: ["whatsapp"],
        agentId: "agent-9",
      },
      "org-2",
    );
    expect(where.tags).toEqual({ hasSome: ["vip", "pricing"] });
    expect(where.status).toEqual({ in: ["ACTIVE", "PENDING"] });
    expect(where.channel).toEqual({ in: ["WHATSAPP"] });
    expect(where.assignedAgentId).toBe("agent-9");
  });

  it("builds a createdAt range when dates are provided", () => {
    const where = buildContactWhereFromRules(
      { dateFrom: "2026-01-01T00:00:00.000Z" },
      null,
    );
    expect(where.createdAt).toMatchObject({
      gte: new Date("2026-01-01T00:00:00.000Z"),
    });
  });
});
