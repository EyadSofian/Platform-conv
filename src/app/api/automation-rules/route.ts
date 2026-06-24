import {
  AutomationActionType,
  AutomationTriggerType,
} from "@prisma/client";
import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { recordAudit } from "@/lib/logger";
import { resolveOrganizationId } from "@/lib/org";
import { ForbiddenError, requireUser, userHasRole } from "@/lib/session";
import { automationRuleCreateSchema } from "@/lib/validators";
import {
  createAutomationRule,
  listAutomationRules,
} from "@/services/automation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const rules = await listAutomationRules(organizationId);
    return ok(rules);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // Editing automation requires elevated privileges.
    if (!userHasRole(user, ["ADMIN", "SUPERVISOR"])) {
      throw new ForbiddenError("Only admins or supervisors can edit automations.");
    }
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = automationRuleCreateSchema.parse(await readJson(request));
    const rule = await createAutomationRule(organizationId, {
      ...input,
      trigger: input.trigger as AutomationTriggerType,
      action: input.action as AutomationActionType,
    });
    recordAudit("automation.rule.create", user.id, { ruleId: rule.id });
    return created(rule);
  } catch (error) {
    return handleRouteError(error);
  }
}
