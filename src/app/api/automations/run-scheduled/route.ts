import { apiError, handleRouteError, ok } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { ForbiddenError, requireUser, userHasRole } from "@/lib/session";
import { runScheduledAutomations } from "@/services/automation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Evaluates time-based automation rules (NO_REPLY_AFTER, OUTSIDE_BUSINESS_HOURS).
 *
 * Two ways to authorize:
 *  - An external scheduler (e.g. Railway cron) sends `x-cron-secret` matching
 *    AUTOMATION_CRON_SECRET, and runs across every workspace.
 *  - A signed-in admin/supervisor triggers a run for their own workspace.
 */
export async function POST(request: Request) {
  try {
    const cronSecret = process.env.AUTOMATION_CRON_SECRET;
    const provided = request.headers.get("x-cron-secret");

    if (cronSecret && provided) {
      if (provided !== cronSecret) {
        return apiError("Invalid cron secret.", 401);
      }
      const result = await runScheduledAutomations();
      return ok(result);
    }

    const user = await requireUser();
    if (!userHasRole(user, ["ADMIN", "SUPERVISOR"])) {
      throw new ForbiddenError("Only admins or supervisors can run automations.");
    }
    const organizationId = await resolveOrganizationId(user.organizationId);
    const result = await runScheduledAutomations({ organizationId });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
