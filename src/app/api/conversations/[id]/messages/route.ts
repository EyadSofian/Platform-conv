import { apiError, handleRouteError, ok } from "@/lib/api";
import { getConversationWithMessages } from "@/services/conversation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const before = url.searchParams.get("before") ?? undefined;

    const result = await getConversationWithMessages(params.id, {
      limit: Number.isFinite(limit) ? limit : 50,
      before,
    });

    if (!result) return apiError("Conversation not found.", 404);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
