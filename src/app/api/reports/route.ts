import { handleRouteError, ok } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { buildReport } from "@/services/reporting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const rangeParam = Number(
      new URL(request.url).searchParams.get("days") ?? "30",
    );
    const rangeDays = Number.isFinite(rangeParam)
      ? Math.min(Math.max(rangeParam, 1), 365)
      : 30;
    const report = await buildReport(organizationId, rangeDays);
    return ok(report);
  } catch (error) {
    return handleRouteError(error);
  }
}
