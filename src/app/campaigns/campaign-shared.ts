export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "COMPLETED"
  | "PAUSED";

export type CampaignType = "BLAST" | "DRIP";

export type Campaign = {
  id: string;
  name: string;
  message: string;
  type: CampaignType;
  status: CampaignStatus;
  channel: string;
  templateName: string | null;
  templateLanguage: string | null;
  respectOptIn: boolean;
  rateLimitPerMinute: number;
  scheduledAt: string | null;
  targetRules: {
    tags?: string[];
    status?: string[];
    channel?: string[];
    agentId?: string | null;
    dateFrom?: string;
    dateTo?: string;
  } | null;
  queuedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  skippedCount: number;
  convertedCount: number;
  createdAt: string;
  createdBy?: { id: string; name: string | null; email: string } | null;
  _count?: { recipients: number };
};

export type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
};

export type ValidationResult = {
  total: number;
  eligible: number;
  skipped: number;
  skippedByReason: Record<string, number>;
  templateRequired: boolean;
  templateName: string | null;
};

export const STATUS_TONE: Record<
  CampaignStatus,
  "teal" | "slate" | "amber" | "blue" | "neutral"
> = {
  RUNNING: "teal",
  SCHEDULED: "blue",
  PAUSED: "amber",
  COMPLETED: "neutral",
  DRAFT: "slate",
};

/** Thin fetch wrapper that unwraps the platform `{ data }` / `{ error }` shape. */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `Request failed (${response.status})`);
  }
  return json.data as T;
}

export function rate(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}
