import { withMobileAuth } from "@/lib/mobile/http";
import { getMonth } from "@/lib/services/time";

// Ore della persona stessa in un mese: GET /v1/time?month=YYYY-MM.
export const GET = withMobileAuth(async ({ user }, req) =>
  getMonth({ id: user.id, role: user.role }, new URL(req.url).searchParams.get("month"))
);
