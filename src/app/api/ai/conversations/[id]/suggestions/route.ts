import { apiError, handleRouteError, ok } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import {
  ConversationAssistanceNotFoundError,
  generateConversationAssistance,
} from "@/services/ai-assistant-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const assistance = await generateConversationAssistance(
      organizationId,
      params.id,
    );

    return ok(assistance);
  } catch (error) {
    if (error instanceof ConversationAssistanceNotFoundError) {
      return apiError(error.message, error.status);
    }
    return handleRouteError(error);
  }
}

