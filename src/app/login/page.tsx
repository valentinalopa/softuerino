import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { Marchio } from "@/components/brand/Marchio";
import { TONE_SOFT } from "@/lib/tones";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect(homePathFor(session.user.role));
  }

  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-3">
          <Marchio className="h-10" />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-3xl leading-9 tracking-tight">
              Softuerino
            </CardTitle>
            <CardDescription>Accedi al gestionale del team.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p
              role="alert"
              className={`mb-4 rounded-xl px-4 py-3 text-sm ${TONE_SOFT.danger}`}
            >
              Email o password non corrette.
            </p>
          )}

          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
