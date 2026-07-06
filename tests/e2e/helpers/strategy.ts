import type { Page } from "@playwright/test";

interface StrategyInstanceSummary {
  id: string;
  name: string;
}

interface StrategyTemplateSummary {
  id: string;
  name: string;
}

export async function ensureStrategyInstance(page: Page): Promise<string> {
  const instancesRes = await page.request.get("/api/strategy-instances");
  if (!instancesRes.ok()) {
    throw new Error(`Failed to list strategies: ${instancesRes.status()}`);
  }

  const instancesBody = (await instancesRes.json()) as { instances?: StrategyInstanceSummary[] };
  const existing = instancesBody.instances?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const templatesRes = await page.request.get("/api/strategy-templates");
  if (!templatesRes.ok()) {
    throw new Error(`Failed to list strategy templates: ${templatesRes.status()}`);
  }

  const templatesBody = (await templatesRes.json()) as { templates?: StrategyTemplateSummary[] };
  const template = templatesBody.templates?.[0];
  if (!template?.id) {
    throw new Error("No strategy templates available for E2E fork.");
  }

  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "pasa_csrf")?.value;
  if (!csrf) {
    throw new Error("Missing CSRF cookie after sign-in.");
  }

  const forkRes = await page.request.post("/api/strategy-instances", {
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    data: {
      templateId: template.id,
      name: "E2E Strategy",
    },
  });

  if (!forkRes.ok()) {
    const body = await forkRes.text();
    throw new Error(`Failed to fork strategy: ${forkRes.status()} ${body}`);
  }

  const forkBody = (await forkRes.json()) as { instance?: StrategyInstanceSummary };
  if (!forkBody.instance?.id) {
    throw new Error("Fork response missing instance id.");
  }

  return forkBody.instance.id;
}
