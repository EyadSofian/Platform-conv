import { Availability, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { apiError, handleRouteError, ok, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { userRoleSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
  role: userRoleSchema.optional(),
  availability: z
    .preprocess(
      (value) => (typeof value === "string" ? value.toUpperCase() : value),
      z.enum(["ONLINE", "BUSY", "AWAY", "OFFLINE"]),
    )
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const input = userUpdateSchema.parse(await readJson(request));
    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        name: input.name,
        email: input.email?.toLowerCase(),
        password: input.password ? await hash(input.password, 10) : undefined,
        role: input.role as UserRole | undefined,
        availability: input.availability as Availability | undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        availability: true,
        updatedAt: true,
      },
    });

    return ok(user);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update")) {
      return apiError("User not found.", 404);
    }
    return handleRouteError(error);
  }
}
