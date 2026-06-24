import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";

export type SessionUser = NonNullable<Session["user"]>;

export async function getCurrentSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new RequireSessionError();
  }
  return user;
}

export function userHasRole(
  user: SessionUser | null | undefined,
  roles: string[],
) {
  if (!user?.role) return false;
  return roles.includes(user.role);
}

/**
 * Returns the active organization id for the current request, or null when the
 * user has not been attached to a workspace yet. API handlers should scope
 * every query by this value once the multi-tenant backfill has run.
 */
export async function getActiveOrganizationId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.organizationId ?? null;
}

export async function requireOrganization(): Promise<{
  user: SessionUser;
  organizationId: string;
}> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) {
    throw new ForbiddenError("No active workspace for this account.");
  }
  return { user, organizationId };
}

export class RequireSessionError extends Error {
  status = 401;
  constructor() {
    super("Authentication required.");
    this.name = "RequireSessionError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
