import { withMobileAuth } from "@/lib/mobile/http";
import { getOwnRecoveryCredits } from "@/lib/services/leave";

// Recuperi da fare ancora da smaltire (sola lettura: li registra solo il super admin dal web).
export const GET = withMobileAuth(async ({ user }) => ({
  recoveryCredits: await getOwnRecoveryCredits({ id: user.id, role: user.role, employmentType: user.employmentType }),
}));
