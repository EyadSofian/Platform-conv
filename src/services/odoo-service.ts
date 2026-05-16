import { Prisma } from "@prisma/client";
import { createOdooCrmLead, upsertOdooPartner } from "../lib/odoo";
import { prisma } from "../lib/prisma";

export async function pushContactToOdoo(contactId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error("Contact not found.");

  try {
    const partnerId = await upsertOdooPartner({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags,
      source: contact.channel.toLowerCase(),
    });

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { odooPartnerId: partnerId },
    });

    await prisma.odooSyncLog.create({
      data: {
        model: "res.partner",
        recordId: partnerId,
        operation: "upsert",
        payload: { contactId } as Prisma.InputJsonObject,
      },
    });

    return updated;
  } catch (error) {
    await prisma.odooSyncLog.create({
      data: {
        model: "res.partner",
        operation: "upsert",
        status: "failed",
        payload: { contactId } as Prisma.InputJsonObject,
        error: error instanceof Error ? error.message : "Unknown Odoo error",
      },
    });
    throw error;
  }
}

export async function syncLeadToOdoo(contactId: string, description?: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error("Contact not found.");

  try {
    const partnerId =
      contact.odooPartnerId ??
      (await upsertOdooPartner({
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        tags: contact.tags,
        source: contact.channel.toLowerCase(),
      }));

    const leadId = await createOdooCrmLead({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      partnerId,
      source: contact.channel.toLowerCase(),
      description,
    });

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { odooPartnerId: partnerId, odooLeadId: leadId },
    });

    await prisma.odooSyncLog.create({
      data: {
        model: "crm.lead",
        recordId: leadId,
        operation: "create",
        payload: { contactId, partnerId } as Prisma.InputJsonObject,
      },
    });

    return updated;
  } catch (error) {
    await prisma.odooSyncLog.create({
      data: {
        model: "crm.lead",
        operation: "create",
        status: "failed",
        payload: { contactId } as Prisma.InputJsonObject,
        error: error instanceof Error ? error.message : "Unknown Odoo error",
      },
    });
    throw error;
  }
}
