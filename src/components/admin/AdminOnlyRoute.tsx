import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

interface AdminOnlyRouteProps {
  children: ReactNode;
}

export function AdminOnlyRoute({ children }: AdminOnlyRouteProps) {
  const { isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="space-y-4 pt-4">
        <div className="h-7 w-48 bg-muted/40 rounded animate-pulse" />
        <div className="h-4 w-80 bg-muted/30 rounded animate-pulse" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/admin" state={{ from: location, reason: 'admin-only' }} replace />;
  }

  return <>{children}</>;
}
