import { OrgRole } from "@prisma/client";
import { prisma } from "./prisma";

export const DEFAULT_ORG_SLUG = "default";

/**
 * Ensures a default workspace exists. Used by the seed and as a safety net for
 * environments that pre-date multi-tenancy, where existing rows have a null
 * `organizationId`. New installs should create real organizations instead.
 */
export async function ensureDefaultOrganization() {
  return prisma.organization.upsert({
    where: { slug: DEFAULT_ORG_SLUG },
    update: {},
    create: { name: "Default Workspace", slug: DEFAULT_ORG_SLUG },
  });
}

let cachedFallbackOrgId: string | null = null;

/**
 * Resolves an organization id to scope a write to when the session does not yet
 * carry one (legacy data). Prefers any existing organization, otherwise creates
 * the default workspace. The result is memoized per server process.
 */
export async function getFallbackOrganizationId(): Promise<string> {
  if (cachedFallbackOrgId) return cachedFallbackOrgId;
  const existing = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) {
    cachedFallbackOrgId = existing.id;
    return existing.id;
  }
  const created = await ensureDefaultOrganization();
  cachedFallbackOrgId = created.id;
  return created.id;
}

/**
 * Resolves the organization id to use for a request: the session's workspace
 * when present, otherwise a fallback so the platform keeps working during the
 * backfill window.
 */
export async function resolveOrganizationId(
  sessionOrganizationId?: string | null,
): Promise<string> {
  if (sessionOrganizationId) return sessionOrganizationId;
  return getFallbackOrganizationId();
}

export async function ensureMembership(
  organizationId: string,
  userId: string,
  role: OrgRole = OrgRole.AGENT,
) {
  return prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: {},
    create: { organizationId, userId, role },
  });
}
