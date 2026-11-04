import { WORKSHOP_UI, readWorkshopResult, type WorkshopRequest, type WorkshopResult } from "./workshop-view";

const CLIENT_TIMEOUT_MS = 15_000;

export async function postWorkshop(body: WorkshopRequest, fetchImpl: typeof fetch = fetch): Promise<WorkshopResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const response = await fetchImpl("/api/workshop", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    return (
      readWorkshopResult(data) ?? {
        ok: false,
        error: "network",
        message: WORKSHOP_UI.failed,
      }
    );
  } catch {
    return { ok: false, error: "network", message: WORKSHOP_UI.failed };
  } finally {
    clearTimeout(timer);
  }
}
