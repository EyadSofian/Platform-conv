import { IntegrationType } from "@prisma/client";
import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { ForbiddenError, requireUser, userHasRole } from "@/lib/session";
import { integrationCreateSchema } from "@/lib/validators";
import { writeAudit } from "@/services/audit-service";
import {
  createIntegration,
  listIntegrations,
} from "@/services/integration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const integrations = await listIntegrations(organizationId);
    return ok(integrations);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!userHasRole(user, ["ADMIN", "SUPERVISOR"])) {
      throw new ForbiddenError("Only admins or supervisors can manage integrations.");
    }
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = integrationCreateSchema.parse(await readJson(request));
    const integration = await createIntegration(organizationId, {
      ...input,
      type: input.type as IntegrationType,
    });
    await writeAudit("integration.create", {
      organizationId,
      actorId: user.id,
      targetType: "integration",
      targetId: integration.id,
      metadata: { type: integration.type },
    });
    return created(integration);
  } catch (error) {
    return handleRouteError(error);
  }
}
