import {
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus,
} from "@prisma/client";
import { apiError, handleRouteError, noContent, ok, readJson } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { templateUpdateSchema } from "@/lib/validators";
import {
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from "@/services/template-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const template = await getTemplate(organizationId, params.id);
    if (!template) return apiError("Template not found.", 404);
    return ok(template);
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
    const input = templateUpdateSchema.parse(await readJson(request));
    const template = await updateTemplate(organizationId, params.id, {
      category: input.category as WhatsAppTemplateCategory | undefined,
      status: input.status as WhatsAppTemplateStatus | undefined,
      components: input.components,
    });
    if (!template) return apiError("Template not found.", 404);
    return ok(template);
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
    const organizationId = await resolveOrganizationId(user.organizationId);
    const deleted = await deleteTemplate(organizationId, params.id);
    if (!deleted) return apiError("Template not found.", 404);
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
