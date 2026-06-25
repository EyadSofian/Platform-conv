import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase();
        const password = credentials?.password;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: {
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        });
        if (!user?.password) return null;

        const valid = await compare(password, user.password);
        if (!valid) return null;

        const membership = user.memberships[0] ?? null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          organizationId: membership?.organizationId ?? null,
          orgRole: membership?.role ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId ?? null;
        token.orgRole = user.orgRole ?? null;
      }

      // Workspace switching: the client calls `update({ organizationId })`.
      // Only honour it when the user is actually a member of that workspace.
      if (
        trigger === "update" &&
        session?.organizationId &&
        token.id
      ) {
        const membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: String(session.organizationId),
              userId: String(token.id),
            },
          },
        });
        if (membership) {
          token.organizationId = membership.organizationId;
          token.orgRole = membership.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = (token.organizationId as string) ?? null;
        session.user.orgRole = (token.orgRole as string) ?? null;
      }
      return session;
    },
  },
};
