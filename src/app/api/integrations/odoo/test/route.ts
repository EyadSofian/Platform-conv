import { handleRouteError, ok } from "@/lib/api";
import { odooLogin } from "@/lib/odoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { uid, url, db, username } = await odooLogin();
    return ok({ connected: true, uid, url, db, username });
  } catch (error) {
    return handleRouteError(error);
  }
}
