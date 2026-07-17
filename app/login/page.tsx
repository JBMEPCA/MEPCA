import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Cogent Hub" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight text-[#29abe2]">COGENT</span>
          <span className="ml-2 text-2xl font-light tracking-tight text-foreground">
            MULTIMEDIA
          </span>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to the Hub
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
