import { RoleGuard } from "@/components/auth/RoleGuard";
import { ReviewQueue } from "@/components/reviewer/ReviewQueue";

export function ReviewerDashboard() {
  return (
    <RoleGuard role="reviewer">
      <div className="container mx-auto px-6 py-8">
        <ReviewQueue />
      </div>
    </RoleGuard>
  );
}