import {
  IntegrationStatus,
  IntegrationType,
  Prisma,
} from "@prisma/client";
import type { Integration } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { log } from "../lib/logger";

/** Strips secret values so integrations are safe to return to the client. */
export function redactIntegration(integration: Integration) {
  const credentials = (integration.credentials ?? {}) as Record<string, unknown>;
  const rest = { ...integration } as Partial<Integration>;
  delete rest.credentials;
  return {
    ...rest,
    hasCredentials: Object.keys(credentials).length > 0,
    credentialKeys: Object.keys(credentials),
  };
}

export async function listIntegrations(organizationId: string) {
  const integrations = await prisma.integration.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  return integrations.map(redactIntegration);
}

export async function createIntegration(
  organizationId: string,
  input: {
    type: IntegrationType;
    name: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    events?: string[];
  },
) {
  const integration = await prisma.integration.create({
    data: {
      organizationId,
      type: input.type,
      name: input.name,
      enabled: input.enabled ?? true,
      status: input.credentials
        ? IntegrationStatus.CONNECTED
        : IntegrationStatus.DISCONNECTED,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
      credentials: (input.credentials ?? {}) as Prisma.InputJsonValue,
      events: input.events ?? [],
    },
  });
  return redactIntegration(integration);
}

export async function updateIntegration(
  organizationId: string,
  id: string,
  input: {
    name?: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    events?: string[];
  },
) {
  const owned = await prisma.integration.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!owned) return null;
  const integration = await prisma.integration.update({
    where: { id },
    data: {
      name: input.name,
      enabled: input.enabled,
      config:
        input.config === undefined
          ? undefined
          : (input.config as Prisma.InputJsonValue),
      credentials:
        input.credentials === undefined
          ? undefined
          : (input.credentials as Prisma.InputJsonValue),
      events: input.events,
      ...(input.credentials
        ? { status: IntegrationStatus.CONNECTED }
        : {}),
    },
  });
  return redactIntegration(integration);
}

export async function deleteIntegration(organizationId: string, id: string) {
  const owned = await prisma.integration.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!owned) return false;
  await prisma.integration.delete({ where: { id } });
  return true;
}

/**
 * Fan-out a platform event to all enabled integrations subscribed to it.
 * Webhook/Zapier integrations receive an HTTP POST; CRM connectors
 * (HubSpot/Shopify) are scaffolded. Failures are isolated and recorded on the
 * integration row.
 */
export async function dispatchIntegrationEvent(
  organizationId: string | null | undefined,
  event: string,
  data: Record<string, unknown>,
) {
  if (!organizationId) return;
  const integrations = await prisma.integration.findMany({
    where: { organizationId, enabled: true },
  });

  for (const integration of integrations) {
    if (integration.events.length > 0 && !integration.events.includes(event)) {
      continue;
    }
    try {
      await runConnector(integration, event, data);
    } catch (error) {
      log.error("integration dispatch failed", error, {
        integrationId: integration.id,
        type: integration.type,
        event,
      });
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: IntegrationStatus.ERROR,
          lastError: error instanceof Error ? error.message : "dispatch_failed",
        },
      });
    }
  }
}

async function runConnector(
  integration: Integration,
  event: string,
  data: Record<string, unknown>,
) {
  const config = (integration.config ?? {}) as Record<string, unknown>;
  const credentials = (integration.credentials ?? {}) as Record<string, unknown>;

  switch (integration.type) {
    case IntegrationType.ZAPIER:
    case IntegrationType.WEBHOOK: {
      const url = config.url ? String(config.url) : null;
      if (!url) throw new Error("Webhook URL is not configured.");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(credentials.secret
            ? { "x-webhook-secret": String(credentials.secret) }
            : {}),
        },
        body: JSON.stringify({ event, organizationId: integration.organizationId, data }),
      });
      if (!response.ok) {
        throw new Error(`Webhook responded ${response.status}`);
      }
      await markSynced(integration.id);
      break;
    }
    case IntegrationType.HUBSPOT: {
      await syncContactToHubSpot(config, credentials, data);
      await markSynced(integration.id);
      break;
    }
    case IntegrationType.SHOPIFY: {
      await syncContactToShopify(config, credentials, data);
      await markSynced(integration.id);
      break;
    }
    case IntegrationType.ODOO:
    case IntegrationType.BOTPRESS:
      // Handled by their dedicated services; no generic event dispatch.
      break;
  }
}

/**
 * Loads the contact referenced by a dispatched event so connectors can sync a
 * full profile (name/email/phone/tags) rather than just an id.
 */
async function resolveDispatchContact(data: Record<string, unknown>) {
  const contactId = data.contactId ? String(data.contactId) : null;
  if (!contactId) return null;
  return prisma.contact.findUnique({ where: { id: contactId } });
}

function splitName(name?: string | null): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Upserts the contact into HubSpot via the CRM v3 API using a private-app
 * access token. Looks the contact up by email (when present) to avoid
 * duplicates, otherwise creates a new record.
 */
async function syncContactToHubSpot(
  config: Record<string, unknown>,
  credentials: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  const token = String(
    credentials.accessToken ?? credentials.token ?? credentials.apiKey ?? "",
  );
  if (!token) throw new Error("HubSpot access token is not configured.");

  const contact = await resolveDispatchContact(data);
  const email = contact?.email ?? (data.email ? String(data.email) : null);
  const phone = contact?.phone ?? (data.phone ? String(data.phone) : null);
  if (!email && !phone) throw new Error("Contact has no email or phone to sync.");

  const { first, last } = splitName(contact?.name);
  const properties: Record<string, string> = {};
  if (email) properties.email = email;
  if (phone) properties.phone = phone;
  if (first) properties.firstname = first;
  if (last) properties.lastname = last;

  const base = String(config.baseUrl ?? "https://api.hubapi.com");
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };

  // Find an existing contact by email so we update instead of duplicating.
  let existingId: string | null = null;
  if (email) {
    const searchRes = await fetch(`${base}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "email", operator: "EQ", value: email },
            ],
          },
        ],
        properties: ["email"],
        limit: 1,
      }),
    });
    if (searchRes.ok) {
      const body = (await searchRes.json()) as {
        results?: { id: string }[];
      };
      existingId = body.results?.[0]?.id ?? null;
    }
  }

  const response = existingId
    ? await fetch(`${base}/crm/v3/objects/contacts/${existingId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ properties }),
      })
    : await fetch(`${base}/crm/v3/objects/contacts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ properties }),
      });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HubSpot responded ${response.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Upserts the contact into Shopify as a customer via the Admin REST API. Looks
 * the customer up by email first to avoid duplicate records.
 */
async function syncContactToShopify(
  config: Record<string, unknown>,
  credentials: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  const token = String(credentials.accessToken ?? credentials.token ?? "");
  const shop = String(config.shop ?? config.shopDomain ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!token) throw new Error("Shopify access token is not configured.");
  if (!shop) throw new Error("Shopify shop domain is not configured.");

  const contact = await resolveDispatchContact(data);
  const email = contact?.email ?? (data.email ? String(data.email) : null);
  const phone = contact?.phone ?? (data.phone ? String(data.phone) : null);
  if (!email && !phone) throw new Error("Contact has no email or phone to sync.");

  const { first, last } = splitName(contact?.name);
  const apiVersion = String(config.apiVersion ?? "2024-01");
  const base = `https://${shop}/admin/api/${apiVersion}`;
  const headers = {
    "x-shopify-access-token": token,
    "content-type": "application/json",
  };

  const customer: Record<string, unknown> = {
    tags: (contact?.tags ?? []).join(", "),
  };
  if (email) customer.email = email;
  if (phone) customer.phone = phone;
  if (first) customer.first_name = first;
  if (last) customer.last_name = last;
  if (typeof contact?.whatsappOptIn === "boolean") {
    customer.accepts_marketing = contact.whatsappOptIn && !contact.unsubscribed;
  }

  // Search by email to decide create vs update.
  let existingId: number | null = null;
  if (email) {
    const searchRes = await fetch(
      `${base}/customers/search.json?query=${encodeURIComponent(`email:${email}`)}`,
      { headers },
    );
    if (searchRes.ok) {
      const body = (await searchRes.json()) as {
        customers?: { id: number }[];
      };
      existingId = body.customers?.[0]?.id ?? null;
    }
  }

  const response = existingId
    ? await fetch(`${base}/customers/${existingId}.json`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ customer: { id: existingId, ...customer } }),
      })
    : await fetch(`${base}/customers.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({ customer }),
      });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Shopify responded ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function markSynced(id: string) {
  await prisma.integration.update({
    where: { id },
    data: { status: IntegrationStatus.CONNECTED, lastSyncAt: new Date(), lastError: null },
  });
}
