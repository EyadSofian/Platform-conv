import { apiError, handleRouteError } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a stored media object back to an authenticated user. Objects tagged
 * with an organization are only served to members of that workspace.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);

    const object = await getStorage().get(params.id);
    if (!object) return apiError("Media not found.", 404);

    if (
      object.metadata.organizationId &&
      object.metadata.organizationId !== organizationId
    ) {
      return apiError("Media not found.", 404);
    }

    return new Response(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "content-type": object.metadata.contentType,
        "content-length": String(object.metadata.size),
        "content-disposition": `inline; filename="${object.metadata.filename.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
