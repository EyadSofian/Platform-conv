import { handleRouteError, ok } from "@/lib/api";
import { listConversations } from "@/services/conversation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const conversations = await listConversations({
      status: params.get("status") ?? undefined,
      agentId: params.get("agentId") ?? undefined,
      tag: params.get("tag") ?? undefined,
      channel: params.get("channel") ?? undefined,
      q: params.get("q") ?? undefined,
      unassigned: params.get("unassigned") === "true",
    });

    return ok(conversations);
  } catch (error) {
    return handleRouteError(error);
  }
}
