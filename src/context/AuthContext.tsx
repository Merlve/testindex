import axios from 'axios';
import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: string | null;
  token: string | null;
  login: (user: string, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(localStorage.getItem('qs_user'));
  const [token, setToken] = useState<string | null>(localStorage.getItem('qs_token'));

  
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => {
        if (response.data && response.data.code === 401) {
          logout();
          const err: any = new Error(response.data.message || 'Unauthorized');
          err.response = response;
          return Promise.reject(err);
        }
        return response;
      },
      error => {
        if (error.response && error.response.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  useEffect(() => {
    let interval: any;
    if (user === 'guest') {
      interval = setInterval(() => {
        const loginTime = parseInt(localStorage.getItem('qs_guest_login_time') || '0');
        if (Date.now() - loginTime > 60000) {
          logout();
          localStorage.setItem('guest_timeout', 'true');
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [user]);

  const login = (newUser: string, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('qs_user', newUser);
    localStorage.setItem('qs_token', newToken);
    if (newUser === 'guest') {
      localStorage.setItem('qs_guest_login_time', Date.now().toString());
    } else {
      localStorage.removeItem('qs_guest_login_time');
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('qs_user');
    localStorage.removeItem('qs_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
