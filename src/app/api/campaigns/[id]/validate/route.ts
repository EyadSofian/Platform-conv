import { apiError, handleRouteError, ok } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { validateCampaignRecipients } from "@/services/campaign-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dry-run recipient validation for a campaign: how many contacts are eligible
 * vs skipped (and why), without sending anything.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, organizationId },
      select: { id: true },
    });
    if (!campaign) return apiError("Campaign not found.", 404);

    const result = await validateCampaignRecipients(params.id);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
