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
}) {
  if (!input.phone) return "missing_phone";
  if (!input.whatsappOptIn) return "missing_whatsapp_opt_in";
  if (input.marketingPaused) return "marketing_paused";
  return null;
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
