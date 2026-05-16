import { apiError, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
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
