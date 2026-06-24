import {
  AutomationActionType,
  AutomationTriggerType,
} from "@prisma/client";
import { apiError, handleRouteError, noContent, ok, readJson } from "@/lib/api";
import { recordAudit } from "@/lib/logger";
import { resolveOrganizationId } from "@/lib/org";
import { ForbiddenError, requireUser, userHasRole } from "@/lib/session";
import { automationRuleUpdateSchema } from "@/lib/validators";
import {
  deleteAutomationRule,
  updateAutomationRule,
} from "@/services/automation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    if (!userHasRole(user, ["ADMIN", "SUPERVISOR"])) {
      throw new ForbiddenError("Only admins or supervisors can edit automations.");
    }
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = automationRuleUpdateSchema.parse(await readJson(request));
    const rule = await updateAutomationRule(organizationId, params.id, {
      ...input,
      trigger: input.trigger as AutomationTriggerType | undefined,
      action: input.action as AutomationActionType | undefined,
    });
    if (!rule) return apiError("Automation rule not found.", 404);
    recordAudit("automation.rule.update", user.id, { ruleId: rule.id });
    return ok(rule);
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
      throw new ForbiddenError("Only admins or supervisors can edit automations.");
    }
    const organizationId = await resolveOrganizationId(user.organizationId);
    const deleted = await deleteAutomationRule(organizationId, params.id);
    if (!deleted) return apiError("Automation rule not found.", 404);
    recordAudit("automation.rule.delete", user.id, { ruleId: params.id });
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
