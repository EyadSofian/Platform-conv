import { parse } from "csv-parse/sync";
import { created, handleRouteError } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { contactCreateSchema } from "@/lib/validators";
import { upsertContact } from "@/services/contact-service";
import { ensureConversationForContact } from "@/services/conversation-service";

export const runtime = "nodejs";

// Columns consumed by the structured schema; everything else becomes a custom
// field so imports never silently drop data.
const KNOWN_COLUMNS = new Set([
  "name",
  "phone",
  "email",
  "channel",
  "status",
  "tags",
  "botpressuserid",
  "botpress_user_id",
  "botpressconvid",
  "botpress_conversation_id",
  "assignedagentid",
  "whatsappoptin",
  "opt_in",
  "whatsappoptinat",
  "opt_in_at",
  "whatsappoptinsource",
  "opt_in_source",
  "unsubscribed",
  "marketingpaused",
]);

function buildCustomFields(row: Record<string, string>) {
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!KNOWN_COLUMNS.has(key.toLowerCase().trim()) && value) {
      custom[key] = value;
    }
  }
  return Object.keys(custom).length > 0 ? custom : undefined;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Upload a CSV file in the 'file' form field.");
    }

    const csv = await file.text();
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    let importedCount = 0;
    let deduplicatedCount = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const input = contactCreateSchema.parse({
          name: row.name || row.Name || undefined,
          phone: row.phone || row.Phone || undefined,
          email: row.email || row.Email || undefined,
          channel: row.channel || row.Channel || "web",
          botpressUserId: row.botpressUserId || row.botpress_user_id || undefined,
          botpressConvId:
            row.botpressConvId || row.botpress_conversation_id || undefined,
          status: row.status || "active",
          whatsappOptIn: /^(true|yes|1)$/i.test(row.whatsappOptIn || row.opt_in || ""),
          whatsappOptInAt: row.whatsappOptInAt || row.opt_in_at || undefined,
          whatsappOptInSource:
            row.whatsappOptInSource || row.opt_in_source || "csv_import",
          unsubscribed: /^(true|yes|1)$/i.test(row.unsubscribed || ""),
          tags: (row.tags || "")
            .split(/[;,|]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
          customFields: buildCustomFields(row),
          metadata: { importedFrom: file.name },
        });

        const { contact, created: isNew } = await upsertContact(
          organizationId,
          input,
        );
        await ensureConversationForContact(contact.id);
        importedCount += 1;
        if (!isNew) deduplicatedCount += 1;
      } catch (rowError) {
        errors.push({
          row: i + 2, // +1 for header, +1 for 1-based index
          error: rowError instanceof Error ? rowError.message : "Invalid row",
        });
      }
    }

    return created({
      importedCount,
      deduplicatedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
