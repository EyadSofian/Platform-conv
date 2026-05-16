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
