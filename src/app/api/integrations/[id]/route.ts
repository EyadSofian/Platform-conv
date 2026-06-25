import { apiError, handleRouteError, noContent, ok, readJson } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { ForbiddenError, requireUser, userHasRole } from "@/lib/session";
import { integrationUpdateSchema } from "@/lib/validators";
import { writeAudit } from "@/services/audit-service";
import {
  deleteIntegration,
  updateIntegration,
} from "@/services/integration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    if (!userHasRole(user, ["ADMIN", "SUPERVISOR"])) {
      throw new ForbiddenError("Only admins or supervisors can manage integrations.");
    }
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = integrationUpdateSchema.parse(await readJson(request));
    const integration = await updateIntegration(organizationId, params.id, input);
    if (!integration) return apiError("Integration not found.", 404);
    await writeAudit("integration.update", {
      organizationId,
      actorId: user.id,
      targetType: "integration",
      targetId: params.id,
    });
    return ok(integration);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    if (!userHasRole(user, ["ADMIN", "SUPERVISOR"])) {
      throw new ForbiddenError("Only admins or supervisors can manage integrations.");
    }
    const organizationId = await resolveOrganizationId(user.organizationId);
    const deleted = await deleteIntegration(organizationId, params.id);
    if (!deleted) return apiError("Integration not found.", 404);
    await writeAudit("integration.delete", {
      organizationId,
      actorId: user.id,
      targetType: "integration",
      targetId: params.id,
    });
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
