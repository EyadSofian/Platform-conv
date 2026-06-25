import { apiError, created, handleRouteError } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES ?? 25 * 1024 * 1024);

/**
 * Uploads a binary attachment (image/document/audio/video) and returns a
 * descriptor whose `url` can be attached to an outbound message or rendered in
 * the inbox. Stored via the configured storage driver (local disk by default).
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return apiError("Expected multipart/form-data with a 'file' field.", 415);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("Missing 'file' field.", 400);
    }
    if (file.size > MAX_BYTES) {
      return apiError(
        `File exceeds the ${Math.round(MAX_BYTES / 1024 / 1024)}MB limit.`,
        413,
      );
    }

    const data = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const metadata = await storage.put({
      data,
      filename: file.name || "upload",
      contentType: file.type || "application/octet-stream",
      organizationId,
    });

    return created({ ...metadata, url: storage.publicUrl(metadata.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
