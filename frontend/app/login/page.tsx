import LoginForm from "@/components/LoginForm";
import { Page, Panel, Title } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <Page>
      <div className="max-w-md mx-auto">
        <Title sub="No wallet, no seed phrase, no fees. Your account is ready in a few seconds.">Sign in</Title>
        <Panel>
          <LoginForm
            next={safeNext}
            demo={process.env.ENABLE_DEMO_LOGIN === "true"}
            googleClientId={process.env.GOOGLE_CLIENT_ID ?? ""}
          />
        </Panel>
      </div>
    </Page>
  );
}
