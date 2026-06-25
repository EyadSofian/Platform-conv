import { apiError, handleRouteError, ok } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, organizationId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        recipients: {
          include: { contact: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        },
      },
    });

    if (!campaign) return apiError("Campaign not found.", 404);
    return ok(campaign);
  } catch (error) {
    return handleRouteError(error);
  }
}
