import { ChannelType } from "@prisma/client";
import {
  handleWebhookIngest,
  handleWebhookVerification,
} from "@/lib/channels/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWebhookVerification(ChannelType.FACEBOOK_MESSENGER, request);
}

export async function POST(request: Request) {
  return handleWebhookIngest(ChannelType.FACEBOOK_MESSENGER, request);
}
