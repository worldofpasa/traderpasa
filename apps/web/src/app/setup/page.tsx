import { getSetupStatus } from "@pasa-trader/core";
import { redirect } from "next/navigation";
import { SetupFlow } from "./setup-flow";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.needsFirstAdmin) {
    redirect("/sign-in");
  }

  return (
    <main className="setup-shell">
      <SetupFlow />
    </main>
  );
}
