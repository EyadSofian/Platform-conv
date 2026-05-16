import { created, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncWhatsAppTemplatesFromMeta } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await prisma.whatsAppTemplate.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return ok(templates);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  try {
    const templates = await syncWhatsAppTemplatesFromMeta();
    return created({ syncedCount: templates.length, templates });
  } catch (error) {
    return handleRouteError(error);
  }
}
