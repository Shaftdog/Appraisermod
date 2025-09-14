import { useQuery } from "@tanstack/react-query";

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'reviewer' | 'appraiser';
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ['/api/auth/me'],
    retry: false,
  });

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';
  const isReviewer = user?.role === 'reviewer' || user?.role === 'admin';
  const isAppraiser = user?.role === 'appraiser';

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    isAdmin,
    isReviewer,
    isAppraiser,
  };
}

export function useRoleGuard(requiredRole: 'admin' | 'reviewer' | 'appraiser') {
  const { user, isLoading, isAuthenticated } = useAuth();
  
  const hasAccess = isAuthenticated && (
    requiredRole === 'admin' && user?.role === 'admin' ||
    requiredRole === 'reviewer' && (user?.role === 'reviewer' || user?.role === 'admin') ||
    requiredRole === 'appraiser' && user?.role === 'appraiser'
  );

  return {
    hasAccess,
    isLoading,
    user
  };
}