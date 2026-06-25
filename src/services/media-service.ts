import { getStorage, type StoredObjectMetadata } from "../lib/storage";
import { log } from "../lib/logger";

export type HostedMedia = StoredObjectMetadata & { url: string };

const MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES ?? 25 * 1024 * 1024);

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const { pathname } = new URL(url);
    const base = pathname.split("/").filter(Boolean).pop();
    return base || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Downloads a remote media object (e.g. a provider-hosted attachment URL) and
 * stores it through the storage driver so the platform serves a stable,
 * authenticated URL rather than leaking provider/CDN links. Returns null on
 * any failure so callers can degrade gracefully (the message still records the
 * text/caption).
 */
export async function ingestRemoteMedia(input: {
  url: string;
  organizationId?: string | null;
  contentType?: string | null;
  filename?: string | null;
  headers?: Record<string, string>;
}): Promise<HostedMedia | null> {
  try {
    const response = await fetch(input.url, { headers: input.headers });
    if (!response.ok) {
      throw new Error(`download responded ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > MAX_BYTES) {
      throw new Error("remote media exceeds size limit");
    }

    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > MAX_BYTES) {
      throw new Error("remote media exceeds size limit");
    }

    const storage = getStorage();
    const metadata = await storage.put({
      data,
      filename: input.filename || filenameFromUrl(input.url, "media"),
      contentType:
        input.contentType ||
        response.headers.get("content-type") ||
        "application/octet-stream",
      organizationId: input.organizationId ?? null,
    });

    return { ...metadata, url: storage.publicUrl(metadata.id) };
  } catch (error) {
    log.error("ingestRemoteMedia failed", error, { url: input.url });
    return null;
  }
}
