import {
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus,
} from "@prisma/client";
import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { templateCreateSchema } from "@/lib/validators";
import { syncWhatsAppTemplatesFromMeta } from "@/lib/whatsapp";
import { createTemplate, listTemplates } from "@/services/template-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const templates = await listTemplates(organizationId);
    return ok(templates);
  } catch (error) {
    return handleRouteError(error);
  }
}

// POST creates a local template, or (with ?sync=1) syncs from the WhatsApp Cloud
// API when credentials are configured.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);

    if (new URL(request.url).searchParams.get("sync") === "1") {
      const templates = await syncWhatsAppTemplatesFromMeta();
      return created({ syncedCount: templates.length, templates });
    }

    const input = templateCreateSchema.parse(await readJson(request));
    const template = await createTemplate(organizationId, {
      ...input,
      category: input.category as WhatsAppTemplateCategory,
      status: input.status as WhatsAppTemplateStatus,
    });
    return created(template);
  } catch (error) {
    return handleRouteError(error);
  }
}
