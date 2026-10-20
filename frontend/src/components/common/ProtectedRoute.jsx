import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader } from './Loader';
import AccessDenied from './AccessDenied';

/**
 * UX gate only, the API 403 is the real protection. `role="admin"` shows
 * AccessDenied instead of redirecting, so a student opening /admin sees why.
 */
const ProtectedRoute = ({ children, role }) => {
  const { user, restoring, justLoggedOut } = useAuth();
  const location = useLocation();

  if (restoring) return <Loader label="Restoring your session…" />;
  // An intentional logout goes to the public homepage; a session that simply
  // ended (401 / direct visit) still goes to /login.
  if (!user) {
    return justLoggedOut.current ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }
  if (role && user.role !== role) return <AccessDenied />;

  return children;
};

export default ProtectedRoute;