import {
  Prisma,
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  extractTemplateVariables,
  renderTemplatePreview,
} from "../lib/whatsapp";

export async function listTemplates(organizationId: string) {
  const templates = await prisma.whatsAppTemplate.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }] },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return templates.map((template) => ({
    ...template,
    variables: extractTemplateVariables(template.components),
  }));
}

export async function getTemplate(organizationId: string, id: string) {
  const template = await prisma.whatsAppTemplate.findFirst({
    where: { id, OR: [{ organizationId }, { organizationId: null }] },
  });
  if (!template) return null;
  return {
    ...template,
    variables: extractTemplateVariables(template.components),
  };
}

export async function createTemplate(
  organizationId: string,
  input: {
    name: string;
    language: string;
    category: WhatsAppTemplateCategory;
    status?: WhatsAppTemplateStatus;
    components?: unknown;
  },
) {
  return prisma.whatsAppTemplate.create({
    data: {
      organizationId,
      name: input.name,
      language: input.language,
      category: input.category,
      status: input.status ?? WhatsAppTemplateStatus.PENDING,
      components: (input.components ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function updateTemplate(
  organizationId: string,
  id: string,
  input: {
    category?: WhatsAppTemplateCategory;
    status?: WhatsAppTemplateStatus;
    components?: unknown;
  },
) {
  // Scope the update to the workspace's own templates.
  const owned = await prisma.whatsAppTemplate.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!owned) return null;
  return prisma.whatsAppTemplate.update({
    where: { id },
    data: {
      category: input.category,
      status: input.status,
      components:
        input.components === undefined
          ? undefined
          : (input.components as Prisma.InputJsonValue),
    },
  });
}

export async function deleteTemplate(organizationId: string, id: string) {
  const owned = await prisma.whatsAppTemplate.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!owned) return false;
  await prisma.whatsAppTemplate.delete({ where: { id } });
  return true;
}

/** Builds a preview by substituting sample variables into the template body. */
export async function previewTemplate(
  organizationId: string,
  id: string,
  variables: Record<string, string>,
) {
  const template = await getTemplate(organizationId, id);
  if (!template) return null;
  return {
    template,
    rendered: renderTemplatePreview(template.components, variables),
  };
}
