import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getStorage } from "@/lib/storage";

const MEDIA_DIR = path.resolve(process.cwd(), ".media-test");

afterAll(async () => {
  await rm(MEDIA_DIR, { recursive: true, force: true });
});

describe("LocalDiskStorage", () => {
  it("round-trips an uploaded object with its metadata", async () => {
    const storage = getStorage();
    const data = Buffer.from("hello media", "utf8");
    const meta = await storage.put({
      data,
      filename: "note.txt",
      contentType: "text/plain",
      organizationId: "org-1",
    });

    expect(meta.size).toBe(data.byteLength);
    expect(meta.filename).toBe("note.txt");
    expect(storage.publicUrl(meta.id)).toBe(`/api/media/${meta.id}`);

    const fetched = await storage.get(meta.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.body.toString("utf8")).toBe("hello media");
    expect(fetched?.metadata.contentType).toBe("text/plain");
    expect(fetched?.metadata.organizationId).toBe("org-1");
  });

  it("rejects path-traversal ids", async () => {
    const storage = getStorage();
    expect(await storage.get("../../etc/passwd")).toBeNull();
    expect(await storage.get("bad/id")).toBeNull();
  });

  it("returns null for unknown ids", async () => {
    const storage = getStorage();
    expect(await storage.get("does-not-exist")).toBeNull();
  });
});
