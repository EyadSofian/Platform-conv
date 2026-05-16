import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/signin" },
});

export const config = {
  matcher: [
    "/((?!api/webhook|api/auth|api/health|signin|_next/static|_next/image|favicon.ico|fonts).*)",
  ],
};
