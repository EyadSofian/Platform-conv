import { z } from "zod";
import { apiError, created, handleRouteError, ok, readJson } from "@/lib/api";
import { recordAudit } from "@/lib/logger";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import {
  ConversationNotFoundError,
  addConversationNote,
  listConversationNotes,
} from "@/services/note-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noteSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty.").max(5000),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireUser();
    const notes = await listConversationNotes(params.id);
    return ok(notes);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireUser();
    const input = noteSchema.parse(await readJson(request));
    const organizationId = await resolveOrganizationId(user.organizationId);

    const note = await addConversationNote({
      conversationId: params.id,
      organizationId,
      authorId: user.id,
      body: input.body,
    });

    recordAudit("conversation.note", user.id, {
      conversationId: params.id,
      noteId: note.id,
    });

    return created(note);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return apiError(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
