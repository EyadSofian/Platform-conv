import { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { created, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { contactCreateSchema } from "@/lib/validators";
import { ensureConversationForContact } from "@/services/conversation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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

    const imported = [];

    for (const row of rows) {
      const input = contactCreateSchema.parse({
        name: row.name || row.Name || undefined,
        phone: row.phone || row.Phone || undefined,
        email: row.email || row.Email || undefined,
        channel: row.channel || row.Channel || "web",
        botpressUserId: row.botpressUserId || row.botpress_user_id || undefined,
        botpressConvId:
          row.botpressConvId || row.botpress_conversation_id || undefined,
        status: row.status || "active",
        assignedAgentId: row.assignedAgentId || undefined,
        whatsappOptIn:
          /^(true|yes|1)$/i.test(row.whatsappOptIn || row.opt_in || ""),
        whatsappOptInAt:
          row.whatsappOptInAt || row.opt_in_at || undefined,
        whatsappOptInSource:
          row.whatsappOptInSource || row.opt_in_source || "csv_import",
        tags: (row.tags || "")
          .split(/[;,|]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        metadata: { importedFrom: file.name },
      });

      const existing = input.botpressUserId
        ? await prisma.contact.findUnique({
            where: { botpressUserId: input.botpressUserId },
          })
        : input.email
          ? await prisma.contact.findFirst({ where: { email: input.email } })
          : null;

      const contact = existing
        ? await prisma.contact.update({
            where: { id: existing.id },
            data: {
              ...input,
              whatsappOptInAt: input.whatsappOptInAt
                ? new Date(input.whatsappOptInAt)
                : undefined,
              metadata: input.metadata as Prisma.InputJsonObject,
            },
          })
        : await prisma.contact.create({
            data: {
              ...input,
              whatsappOptInAt: input.whatsappOptInAt
                ? new Date(input.whatsappOptInAt)
                : undefined,
              metadata: input.metadata as Prisma.InputJsonObject,
            },
          });

      await ensureConversationForContact(contact.id);
      imported.push(contact);
    }

    return created({ importedCount: imported.length, contacts: imported });
  } catch (error) {
    return handleRouteError(error);
  }
}
