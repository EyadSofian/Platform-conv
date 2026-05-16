import { z } from "zod";
import { handleRouteError, ok, readJson } from "@/lib/api";
import { syncLeadToOdoo } from "@/services/odoo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  contactId: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request));
    const contact = await syncLeadToOdoo(input.contactId, input.description);
    return ok(contact);
  } catch (error) {
    return handleRouteError(error);
  }
}
