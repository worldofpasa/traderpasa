import { getCurrentUserFromSessionToken, getSetupStatus } from "@pasa-trader/core";
import { redirect } from "next/navigation";
import { getSessionTokenFromCookies } from "../auth-cookies";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const setupStatus = await getSetupStatus();

  if (setupStatus.needsFirstAdmin) {
    redirect("/setup");
  }

  const currentUser = await getCurrentUserFromSessionToken(await getSessionTokenFromCookies());

  if (currentUser.user) {
    redirect("/");
  }

  return (
    <main className="setup-shell">
      <section className="setup-panel">
        <p className="eyebrow">Local auth</p>
        <h1>Sign in</h1>
        <p className="setup-copy">
          Use the local admin account for this self-hosted Pasa Trader install.
        </p>
        <SignInForm />
      </section>
    </main>
  );
}
