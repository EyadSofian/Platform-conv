import { handleRouteError, ok } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { listConversations } from "@/services/conversation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const params = new URL(request.url).searchParams;
    const conversations = await listConversations({
      organizationId,
      status: params.get("status") ?? undefined,
      agentId: params.get("agentId") ?? undefined,
      tag: params.get("tag") ?? undefined,
      channel: params.get("channel") ?? undefined,
      inboxId: params.get("inboxId") ?? undefined,
      q: params.get("q") ?? undefined,
      unassigned: params.get("unassigned") === "true",
    });

    return ok(conversations);
  } catch (error) {
    return handleRouteError(error);
  }
}
