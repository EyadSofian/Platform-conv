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
    case IntegrationType.HUBSPOT:
    case IntegrationType.SHOPIFY:
      // Scaffolded: real CRM/store sync (contact upsert, order events) lands in
      // a follow-up. We record the dispatch so wiring can be verified.
      log.info("integration connector not yet implemented", {
        type: integration.type,
        event,
        integrationId: integration.id,
      });
      break;
    case IntegrationType.ODOO:
    case IntegrationType.BOTPRESS:
      // Handled by their dedicated services; no generic event dispatch.
      break;
  }
}

async function markSynced(id: string) {
  await prisma.integration.update({
    where: { id },
    data: { status: IntegrationStatus.CONNECTED, lastSyncAt: new Date(), lastError: null },
  });
}
