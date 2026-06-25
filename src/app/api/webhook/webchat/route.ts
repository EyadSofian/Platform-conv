import { ChannelType } from "@prisma/client";
import { handleWebhookIngest } from "@/lib/channels/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound messages from the first-party website chat widget.
export async function POST(request: Request) {
  return handleWebhookIngest(ChannelType.WEBCHAT, request);
}
