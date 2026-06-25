import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { recordAudit } from "@/lib/logger";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { inboxCreateSchema } from "@/lib/validators";
import { createInbox, listInboxes } from "@/services/inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const inboxes = await listInboxes(organizationId);
    return ok(inboxes);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = inboxCreateSchema.parse(await readJson(request));
    const inbox = await createInbox(organizationId, input);

    recordAudit("inbox.create", user.id, {
      inboxId: inbox?.id,
      channelType: inbox?.channelType,
    });

    return created(inbox);
  } catch (error) {
    return handleRouteError(error);
  }
}

