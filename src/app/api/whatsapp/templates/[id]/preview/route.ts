import { apiError, handleRouteError, ok, readJson } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { templatePreviewSchema } from "@/lib/validators";
import { previewTemplate } from "@/services/template-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = templatePreviewSchema.parse(await readJson(request));
    const result = await previewTemplate(organizationId, params.id, input.variables);
    if (!result) return apiError("Template not found.", 404);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
