import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .me()
      .then((res) => {
        setUser(res?.data?.user || null);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credentials) => {
    const res = await authService.login(credentials);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (data) => {
    const res = await authService.register(data);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (_e) {
      // Clear client state even if request fails
    }
    setUser(null);
  }, []);

  const updatePrimaryLanguage = useCallback(async (primaryLanguage) => {
    const res = await authService.updatePrimaryLanguage(primaryLanguage);
    if (res.data?.user) {
      setUser(res.data.user);
      return res.data.user;
    }
    return null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updatePrimaryLanguage,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
