import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { Marchio } from "@/components/brand/Marchio";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-3">
          <Marchio className="h-10" />
          <div className="flex flex-col gap-1">
            <CardTitle className="font-display text-3xl leading-9 font-normal">
              Softuerino
            </CardTitle>
            <CardDescription>Accedi al gestionale del team.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300"
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
