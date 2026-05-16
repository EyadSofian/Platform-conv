type OdooJsonRpcResponse<T> = {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type OdooContactPayload = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  source?: string;
};

function requireOdooConfig() {
  const url = process.env.ODOO_URL?.replace(/\/$/, "");
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const password = process.env.ODOO_PASSWORD;

  if (!url || !db || !username || !password) {
    throw new Error(
      "Odoo integration is missing ODOO_URL, ODOO_DB, ODOO_USERNAME, or ODOO_PASSWORD.",
    );
  }

  return { url, db, username, password };
}

async function jsonRpc<T>(
  url: string,
  method: string,
  params: Record<string, unknown>,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Date.now(),
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as OdooJsonRpcResponse<T>;
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `Odoo request failed: ${response.status}`);
  }

  return data.result as T;
}

export async function odooLogin() {
  const config = requireOdooConfig();
  const uid = await jsonRpc<number>(`${config.url}/jsonrpc`, "call", {
    service: "common",
    method: "login",
    args: [config.db, config.username, config.password],
  });

  if (!uid) throw new Error("Odoo login failed.");
  return { ...config, uid };
}

export async function odooExecuteKw<T>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
) {
  const config = await odooLogin();
  return jsonRpc<T>(`${config.url}/jsonrpc`, "call", {
    service: "object",
    method: "execute_kw",
    args: [
      config.db,
      config.uid,
      config.password,
      model,
      method,
      args,
      kwargs,
    ],
  });
}

export async function upsertOdooPartner(payload: OdooContactPayload) {
  const domain = payload.email
    ? [["email", "=", payload.email]]
    : payload.phone
      ? [["phone", "=", payload.phone]]
      : [];

  const existingIds = domain.length
    ? await odooExecuteKw<number[]>("res.partner", "search", [domain], {
        limit: 1,
      })
    : [];

  const values = {
    name: payload.name || payload.phone || payload.email || "SalesOps Lead",
    email: payload.email || false,
    phone: payload.phone || false,
    mobile: payload.phone || false,
    comment: `Synced from SalesOps Console${payload.source ? ` (${payload.source})` : ""}`,
  };

  if (existingIds[0]) {
    await odooExecuteKw<boolean>("res.partner", "write", [[existingIds[0]], values]);
    return existingIds[0];
  }

  return odooExecuteKw<number>("res.partner", "create", [values]);
}

export async function createOdooCrmLead(input: OdooContactPayload & {
  partnerId?: number | null;
  description?: string;
}) {
  return odooExecuteKw<number>("crm.lead", "create", [
    {
      name: input.name ? `WhatsApp lead - ${input.name}` : "WhatsApp lead",
      partner_id: input.partnerId || false,
      email_from: input.email || false,
      phone: input.phone || false,
      description:
        input.description ??
        `Created from SalesOps WhatsApp campaign${input.source ? ` (${input.source})` : ""}`,
      type: "lead",
    },
  ]);
}
