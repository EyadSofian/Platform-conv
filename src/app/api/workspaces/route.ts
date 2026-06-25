import { handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lists the workspaces (organizations) the current user belongs to, so the
 * app shell can render a workspace switcher. Switching itself happens through
 * the NextAuth `update` trigger (validated against membership in auth.ts).
 */
export async function GET() {
  try {
    const user = await requireUser();
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const workspaces = memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      active: membership.organizationId === user.organizationId,
    }));

    return ok(workspaces);
  } catch (error) {
    return handleRouteError(error);
  }
}
