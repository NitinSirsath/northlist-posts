/** The Profile page became the Space page (owner, 22 Nov 2026): the old address opens it. */
import { Navigate } from '@tanstack/react-router';

export function ProfilePage() {
  return <Navigate to="/space" replace />;
}
