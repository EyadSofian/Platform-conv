import { SignInForm } from "./signin-form";

export const metadata = {
  title: "Sign in — SalesOps",
};

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string; error?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <SignInForm
        callbackUrl={searchParams?.callbackUrl ?? "/inbox"}
        initialError={searchParams?.error}
      />
    </div>
  );
}
