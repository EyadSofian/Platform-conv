import { ChannelType } from "@prisma/client";
import { handleWebhookIngest } from "@/lib/channels/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleWebhookIngest(ChannelType.TELEGRAM, request);
}
