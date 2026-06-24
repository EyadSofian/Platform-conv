import {
  Prisma,
  WhatsAppQualityRating,
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus,
} from "@prisma/client";
import { prisma } from "./prisma";

type MetaTemplate = {
  name: string;
  language: string;
  category: string;
  status: string;
  quality_score?: { score?: string };
  components?: unknown[];
  rejected_reason?: string;
};

function parseTemplateStatus(value?: string): WhatsAppTemplateStatus {
  const normalized = value?.toUpperCase();
  if (normalized === "APPROVED") return WhatsAppTemplateStatus.APPROVED;
  if (normalized === "REJECTED") return WhatsAppTemplateStatus.REJECTED;
  if (normalized === "PAUSED") return WhatsAppTemplateStatus.PAUSED;
  if (normalized === "DISABLED") return WhatsAppTemplateStatus.DISABLED;
  return WhatsAppTemplateStatus.PENDING;
}

function parseTemplateCategory(value?: string): WhatsAppTemplateCategory {
  const normalized = value?.toUpperCase();
  if (normalized === "UTILITY") return WhatsAppTemplateCategory.UTILITY;
  if (normalized === "AUTHENTICATION") {
    return WhatsAppTemplateCategory.AUTHENTICATION;
  }
  return WhatsAppTemplateCategory.MARKETING;
}

function parseQuality(value?: string): WhatsAppQualityRating {
  const normalized = value?.toUpperCase();
  if (normalized === "HIGH") return WhatsAppQualityRating.HIGH;
  if (normalized === "MEDIUM") return WhatsAppQualityRating.MEDIUM;
  if (normalized === "LOW") return WhatsAppQualityRating.LOW;
  return WhatsAppQualityRating.UNKNOWN;
}

export function assertMarketingEligible(input: {
  phone?: string | null;
  whatsappOptIn: boolean;
  marketingPaused: boolean;
  unsubscribed?: boolean;
}) {
  if (!input.phone) return "missing_phone";
  if (!input.whatsappOptIn) return "missing_whatsapp_opt_in";
  if (input.unsubscribed) return "unsubscribed";
  if (input.marketingPaused) return "marketing_paused";
  return null;
}

/**
 * Extracts the ordered, de-duplicated `{{n}}` placeholders from a template's
 * body component so the UI can preview and campaigns can map variables.
 */
export function extractTemplateVariables(components: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of Array.from(value.matchAll(/\{\{\s*(\w+)\s*\}\}/g))) {
        found.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(components);
  // Sort numeric placeholders ({{1}},{{2}}) numerically, named ones alphabetically.
  return Array.from(found).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

/** Renders a template body with sample variables for preview. */
export function renderTemplatePreview(
  components: unknown,
  variables: Record<string, string>,
): string {
  const body = extractTemplateBody(components);
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) =>
    variables[key] !== undefined ? variables[key] : `{{${key}}}`,
  );
}

function extractTemplateBody(components: unknown): string {
  if (typeof components === "string") return components;
  if (components && typeof components === "object") {
    const record = components as Record<string, unknown>;
    if (typeof record.body === "string") return record.body;
    if (Array.isArray(components)) {
      const bodyComponent = (components as Record<string, unknown>[]).find(
        (c) => String(c.type).toUpperCase() === "BODY",
      );
      if (bodyComponent && typeof bodyComponent.text === "string") {
        return bodyComponent.text;
      }
    }
  }
  return "";
}

export async function getApprovedTemplate(name?: string | null, language?: string | null) {
  if (!name) return null;
  const template = await prisma.whatsAppTemplate.findUnique({
    where: { name_language: { name, language: language ?? "en_US" } },
  });

  if (!template) throw new Error(`WhatsApp template ${name}/${language} not found.`);
  if (template.status !== WhatsAppTemplateStatus.APPROVED) {
    throw new Error(`WhatsApp template ${name}/${language} is not approved.`);
  }
  if (template.qualityRating === WhatsAppQualityRating.LOW) {
    throw new Error(`WhatsApp template ${name}/${language} has low quality.`);
  }

  return template;
}

export async function syncWhatsAppTemplatesFromMeta() {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!wabaId || !token) {
    throw new Error("Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN.");
  }

  const url = new URL(`https://graph.facebook.com/v23.0/${wabaId}/message_templates`);
  url.searchParams.set(
    "fields",
    "name,language,category,status,quality_score,components,rejected_reason",
  );
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await response.json()) as { data?: MetaTemplate[]; error?: { message: string } };

  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `Meta template sync failed: ${response.status}`);
  }

  const synced = [];
  for (const template of body.data ?? []) {
    synced.push(
      await prisma.whatsAppTemplate.upsert({
        where: {
          name_language: {
            name: template.name,
            language: template.language,
          },
        },
        create: {
          name: template.name,
          language: template.language,
          category: parseTemplateCategory(template.category),
          status: parseTemplateStatus(template.status),
          qualityRating: parseQuality(template.quality_score?.score),
          components: (template.components ?? []) as Prisma.InputJsonArray,
          rejectionReason: template.rejected_reason,
          lastSyncedAt: new Date(),
        },
        update: {
          category: parseTemplateCategory(template.category),
          status: parseTemplateStatus(template.status),
          qualityRating: parseQuality(template.quality_score?.score),
          components: (template.components ?? []) as Prisma.InputJsonArray,
          rejectionReason: template.rejected_reason,
          lastSyncedAt: new Date(),
        },
      }),
    );
  }

  return synced;
}
