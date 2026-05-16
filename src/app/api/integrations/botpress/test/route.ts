import { apiError, handleRouteError, ok } from "@/lib/api";
import { sendBotPressMessage } from "@/lib/botpress";

export const runtime = "nodejs";

export async function GET() {
  return ok({
    configured: {
      hasWebhookSecret: Boolean(process.env.BOTPRESS_WEBHOOK_SECRET),
      hasSigningSecret: Boolean(process.env.BOTPRESS_SIGNING_SECRET),
      hasOutgoingWebhook: Boolean(process.env.BOTPRESS_OUTGOING_WEBHOOK_URL),
      hasApiToken: Boolean(process.env.BOTPRESS_API_TOKEN),
      hasWorkspaceId: Boolean(process.env.BOTPRESS_WORKSPACE_ID),
      hasBotId: Boolean(process.env.BOTPRESS_BOT_ID),
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as { userId?: string; conversationId?: string };

    if (
      !process.env.BOTPRESS_OUTGOING_WEBHOOK_URL &&
      !process.env.BOTPRESS_API_TOKEN
    ) {
      return apiError(
        "No BOTPRESS_OUTGOING_WEBHOOK_URL or BOTPRESS_API_TOKEN configured.",
        400,
      );
    }

    const userId = body.userId ?? "test-user";
    const conversationId = body.conversationId ?? "test-conversation";

    const result = await sendBotPressMessage({
      userId,
      conversationId,
      type: "event",
      payload: {
        action: "platform.connection_test",
        ts: new Date().toISOString(),
      },
    });

    return ok({
      delivered: result.ok === true,
      result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
