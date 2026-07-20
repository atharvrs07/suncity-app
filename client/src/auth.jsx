import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phone, password) => {
    const d = await api('/api/auth/login', { method: 'POST', body: { phone, password } });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }, []);

  const obLogin = useCallback(async (username, password) => {
    const d = await api('/api/auth/ob-login', { method: 'POST', body: { username, password } });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }, []);

  // Adopt a session issued outside the login endpoints (e.g. the token the
  // OTP signup returns once the account is created and verified).
  const completeSignup = useCallback((token, u) => {
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, obLogin, completeSignup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
