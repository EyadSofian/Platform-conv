import { Availability, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { userRoleSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userCreateSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8).optional(),
  role: userRoleSchema.default("SALES_AGENT"),
  availability: z
    .preprocess(
      (value) => (typeof value === "string" ? value.toUpperCase() : value),
      z.enum(["ONLINE", "BUSY", "AWAY", "OFFLINE"]),
    )
    .default("OFFLINE"),
});

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        availability: true,
        createdAt: true,
        _count: {
          select: {
            assignedConversations: true,
            sentMessages: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return ok(users);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = userCreateSchema.parse(await readJson(request));
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        password: input.password ? await hash(input.password, 10) : undefined,
        role: input.role as UserRole,
        availability: input.availability as Availability,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        availability: true,
        createdAt: true,
      },
    });

    return created(user);
  } catch (error) {
    return handleRouteError(error);
  }
}
