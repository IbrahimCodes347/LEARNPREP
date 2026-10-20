import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../api/endpoints';
import { closeSocket } from '../api/socket';
import { setUnauthorizedHandler } from '../api/http';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);

  /**
   * Set right before an intentional logout clears the user. ProtectedRoute reads
   * it so the guard sends the user to the public homepage ("/") instead of
   * "/login". Without it the guard would win the race and force /login.
   */
  const justLoggedOut = useRef(false);

  // Session restore via /auth/me on boot.
  useEffect(() => {
    let cancelled = false;
    auth
      .me()
      .then((data) => {
        if (!cancelled) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from anywhere drops the session locally too.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(() => {});
  }, []);

  const login = useCallback(async (payload) => {
    const data = await auth.login(payload);
    justLoggedOut.current = false;
    setUser(data?.user ?? null);
    return data?.user ?? null;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await auth.register(payload);
    justLoggedOut.current = false;
    setUser(data?.user ?? null);
    return data?.user ?? null;
  }, []);

  const logout = useCallback(async () => {
    justLoggedOut.current = true;
    try {
      await auth.logout();
    } finally {
      setUser(null);
      closeSocket();
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      restoring,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      justLoggedOut,
      login,
      register,
      logout
    }),
    [user, restoring, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

export default AuthContext;