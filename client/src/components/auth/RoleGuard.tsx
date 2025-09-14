import { useAuth } from "@/lib/auth";
import { ReactNode } from "react";

function useRoleGuard(requiredRole: 'admin' | 'reviewer' | 'appraiser') {
  const { user, loading } = useAuth();
  
  const hasAccess = user && (
    requiredRole === 'admin' && user.role === 'admin' ||
    requiredRole === 'reviewer' && (user.role === 'reviewer' || user.role === 'admin') ||
    requiredRole === 'appraiser' && user.role === 'appraiser'
  );

  return {
    hasAccess: !!hasAccess,
    isLoading: loading,
    user
  };
}

interface RoleGuardProps {
  role: 'admin' | 'reviewer' | 'appraiser';
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGuard({ role, children, fallback }: RoleGuardProps) {
  const { hasAccess, isLoading } = useRoleGuard(role);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}