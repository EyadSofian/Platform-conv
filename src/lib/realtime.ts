import type { RealtimeEvent } from "../types/platform";

const socketPort = process.env.SOCKET_PORT ?? "3001";
const socketSecret = process.env.SOCKET_INTERNAL_SECRET ?? "local-socket-secret";

export async function emitRealtime(event: RealtimeEvent) {
  const endpoint =
    process.env.SOCKET_EMIT_URL ??
    (process.env.NODE_ENV === "production"
      ? `http://127.0.0.1:${process.env.PORT ?? "3000"}/socket-emit`
      : `http://127.0.0.1:${socketPort}/emit`);

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-socket-secret": socketSecret,
      },
      body: JSON.stringify(event),
      cache: "no-store",
    });
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[realtime] Socket server unavailable at ${endpoint}; event queued only in database.`,
      );
    }
  }
}
