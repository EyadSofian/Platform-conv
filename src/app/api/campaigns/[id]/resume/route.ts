import { CampaignStatus } from "@prisma/client";
import { apiError, handleRouteError, ok } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const owned = await prisma.campaign.findFirst({
      where: { id: params.id, organizationId },
      select: { id: true },
    });
    if (!owned) return apiError("Campaign not found.", 404);

    const campaign = await prisma.campaign.update({
      where: { id: params.id },
      data: { status: CampaignStatus.SCHEDULED },
    });

    await emitRealtime({ type: "campaign.updated", payload: campaign });
    return ok(campaign);
  } catch (error) {
    return handleRouteError(error);
  }
}
