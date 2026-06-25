import { apiError, handleRouteError, ok, readJson } from "@/lib/api";
import { recordAudit } from "@/lib/logger";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { inboxUpdateSchema } from "@/lib/validators";
import {
  InboxNotFoundError,
  getInbox,
  updateInbox,
} from "@/services/inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const inbox = await getInbox(organizationId, params.id);

    if (!inbox) return apiError("Inbox not found.", 404);
    return ok(inbox);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = inboxUpdateSchema.parse(await readJson(request));
    const inbox = await updateInbox(organizationId, params.id, input);

    recordAudit("inbox.update", user.id, {
      inboxId: inbox?.id,
      channelType: inbox?.channelType,
      status: inbox?.status,
    });

    return ok(inbox);
  } catch (error) {
    if (error instanceof InboxNotFoundError) {
      return apiError(error.message, error.status);
    }
    return handleRouteError(error);
  }
}

