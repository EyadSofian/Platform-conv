import { CampaignStatus, CampaignType, Channel } from "@prisma/client";
import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { campaignCreateSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { createCampaign } from "@/services/campaign-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get("status");
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: status ? (status.toUpperCase() as CampaignStatus) : undefined,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return ok(campaigns);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = campaignCreateSchema.parse(await readJson(request));
    const campaign = await createCampaign({
      ...input,
      type: input.type as CampaignType,
      status: input.status as CampaignStatus,
      channel: input.channel as Channel,
    });

    return created(campaign);
  } catch (error) {
    return handleRouteError(error);
  }
}
