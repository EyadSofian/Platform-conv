import { prisma } from "../lib/prisma";
import { emitRealtime } from "../lib/realtime";

const noteAuthorSelect = {
  id: true,
  name: true,
  email: true,
} as const;

export async function listConversationNotes(conversationId: string) {
  return prisma.conversationNote.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: noteAuthorSelect } },
  });
}

/**
 * Adds a private/internal note to a conversation. Notes are never delivered to
 * the customer — they only exist on the platform for agent collaboration.
 */
export async function addConversationNote(input: {
  conversationId: string;
  organizationId: string;
  authorId?: string | null;
  body: string;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, organizationId: true },
  });

  if (!conversation) {
    throw new ConversationNotFoundError();
  }

  const note = await prisma.conversationNote.create({
    data: {
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      authorId: input.authorId ?? null,
      body: input.body,
    },
    include: { author: { select: noteAuthorSelect } },
  });

  await emitRealtime({
    type: "note.created",
    room: `conversation:${input.conversationId}`,
    payload: note,
  });

  return note;
}

export class ConversationNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Conversation not found.");
    this.name = "ConversationNotFoundError";
  }
}
