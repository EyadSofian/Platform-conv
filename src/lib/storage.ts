import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Storage abstraction for binary media (uploads + inbound channel media).
 *
 * The default driver writes to local disk under MEDIA_DIR. The interface is
 * intentionally small so an S3/GCS driver can drop in later without touching
 * callers — `put`/`get`/`publicUrl` are all the app needs.
 */
export type StoredObjectMetadata = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  organizationId: string | null;
  createdAt: string;
};

export type StoredObject = {
  metadata: StoredObjectMetadata;
  body: Buffer;
};

export interface StorageDriver {
  put(input: {
    data: Buffer;
    filename: string;
    contentType: string;
    organizationId?: string | null;
  }): Promise<StoredObjectMetadata>;
  get(id: string): Promise<StoredObject | null>;
  publicUrl(id: string): string;
}

const MEDIA_DIR = process.env.MEDIA_DIR
  ? path.resolve(process.env.MEDIA_DIR)
  : path.resolve(process.cwd(), ".media");

/** Rejects ids that could escape the media directory. */
function safeId(id: string): string | null {
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}

class LocalDiskStorage implements StorageDriver {
  private ready: Promise<void> | null = null;

  private async ensureDir() {
    if (!this.ready) this.ready = mkdir(MEDIA_DIR, { recursive: true }).then(() => undefined);
    return this.ready;
  }

  async put(input: {
    data: Buffer;
    filename: string;
    contentType: string;
    organizationId?: string | null;
  }): Promise<StoredObjectMetadata> {
    await this.ensureDir();
    const id = randomUUID();
    const metadata: StoredObjectMetadata = {
      id,
      filename: input.filename || id,
      contentType: input.contentType || "application/octet-stream",
      size: input.data.byteLength,
      organizationId: input.organizationId ?? null,
      createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(MEDIA_DIR, id), input.data);
    await writeFile(
      path.join(MEDIA_DIR, `${id}.json`),
      JSON.stringify(metadata),
    );
    return metadata;
  }

  async get(id: string): Promise<StoredObject | null> {
    const clean = safeId(id);
    if (!clean) return null;
    try {
      const metaRaw = await readFile(path.join(MEDIA_DIR, `${clean}.json`), "utf8");
      const metadata = JSON.parse(metaRaw) as StoredObjectMetadata;
      const body = await readFile(path.join(MEDIA_DIR, clean));
      return { metadata, body };
    } catch {
      return null;
    }
  }

  publicUrl(id: string): string {
    return `/api/media/${id}`;
  }
}

let driver: StorageDriver | null = null;

/** Returns the configured storage driver (local disk by default). */
export function getStorage(): StorageDriver {
  if (!driver) driver = new LocalDiskStorage();
  return driver;
}

/** Test/extension seam to swap in an alternative driver (e.g. S3). */
export function setStorageDriver(next: StorageDriver) {
  driver = next;
}

export async function objectExists(id: string): Promise<boolean> {
  const clean = safeId(id);
  if (!clean) return false;
  try {
    await stat(path.join(MEDIA_DIR, clean));
    return true;
  } catch {
    return false;
  }
}
