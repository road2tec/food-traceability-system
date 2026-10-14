import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../../services/authService';
import { getToken, onUnauthorized, setToken } from '../../services/api';

const AuthContext = createContext(null);
const USER_KEY = 'ft_user';

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function storeUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? readStoredUser() : null));
  // `booting` is true while a stored token is being validated against /auth/me.
  const [booting, setBooting] = useState(() => Boolean(getToken()));

  const clear = useCallback(() => {
    setToken(null);
    storeUser(null);
    setUser(null);
  }, []);

  useEffect(() => {
    onUnauthorized(clear);
    return () => onUnauthorized(null);
  }, [clear]);

  useEffect(() => {
    let alive = true;
    if (!getToken()) {
      setBooting(false);
      return undefined;
    }
    authService
      .me()
      .then((u) => {
        if (!alive) return;
        const profile = u?.user || u;
        setUser(profile);
        storeUser(profile);
      })
      .catch((err) => {
        if (!alive) return;
        // Only drop the session when the server says it is invalid; keep it on network errors.
        if (err?.response?.status === 401 || err?.response?.status === 403) clear();
      })
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, [clear]);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    setToken(result.token);
    storeUser(result.user);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* best effort; the token is dropped regardless */
    }
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ user, role: user?.role, isAuthenticated: Boolean(user), booting, login, logout }),
    [user, booting, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
