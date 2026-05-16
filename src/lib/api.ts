import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, RequireSessionError } from "@/lib/session";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError("Validation failed.", 422, error.flatten());
  }

  if (error instanceof RequireSessionError) {
    return apiError(error.message, error.status);
  }

  if (error instanceof ForbiddenError) {
    return apiError(error.message, error.status);
  }

  if (error instanceof Error) {
    return apiError(error.message, 400);
  }

  return apiError("Unexpected server error.", 500);
}

export function getSearchParam(request: Request, key: string) {
  return new URL(request.url).searchParams.get(key) ?? undefined;
}
