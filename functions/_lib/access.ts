import { isEmail } from "./validate";

export type AccessEnv = {
  ALLOW_DEV_AUTH?: string;
};

export function readAccessEmail(request: Request, env: AccessEnv): string | null {
  const fromAccess = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (fromAccess) {
    const email = fromAccess.trim().toLowerCase();
    return isEmail(email) ? email : null;
  }
  if (env.ALLOW_DEV_AUTH === "true") {
    const dev = request.headers.get("X-Dev-User-Email");
    if (!dev) return null;
    const email = dev.trim().toLowerCase();
    return isEmail(email) ? email : null;
  }
  return null;
}
