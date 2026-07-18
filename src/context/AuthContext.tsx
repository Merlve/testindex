import axios from 'axios';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

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
  const [inactivityTimeoutMinutes, setInactivityTimeoutMinutes] = useState<number>(0);

  

  useEffect(() => {
    if (token) {
       axios.get('/api/config').then(res => {
         if (res.data && res.data.inactivityTimeout !== undefined) {
            setInactivityTimeoutMinutes(res.data.inactivityTimeout);
         }
       }).catch(console.error);
    }
  }, [token]);

  useEffect(() => {
    if (!token || inactivityTimeoutMinutes <= 0) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logout();
        
      }, inactivityTimeoutMinutes * 60 * 1000);
    };

    resetTimer();

    // Throttle the activity handler to avoid excessive clearTimeout/setTimeout
    let throttled = false;
    const handleActivity = () => {
      if (!throttled) {
        resetTimer();
        throttled = true;
        setTimeout(() => { throttled = false; }, 1000);
      }
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, handleActivity));

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [token, inactivityTimeoutMinutes]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => {
        if (response.data && (response.data.code === 401 || (typeof response.data === 'string' && response.data.toLowerCase().includes('invalidated')) || (response.data.message && typeof response.data.message === 'string' && response.data.message.toLowerCase().includes('invalidated')))) {
          logout();
          const err: any = new Error(response.data.message || 'Unauthorized');
          err.response = response;
          return Promise.reject(err);
        }
        return response;
      },
      error => {
        if (error.response && (error.response.status === 401 || (typeof error.response.data === 'string' && error.response.data.toLowerCase().includes('invalidated')) || (error.response.data && error.response.data.message && typeof error.response.data.message === 'string' && error.response.data.message.toLowerCase().includes('invalidated')))) {
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
    } else if (token) {
      // Poll to check if the user is still logged into Openlist
      interval = setInterval(async () => {
        try {
          const res = await axios.get('/api/auth/me', { headers: { Authorization: token } });
          if (res.data && res.data.code === 401) {
            logout();
          }
        } catch (e: any) {
          if (e.response && e.response.status === 401) {
            logout();
          }
        }
      }, 30000);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'qs_token' && e.newValue === null) {
        logout();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user, token]);

  const login = (newUser: string, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('qs_user', newUser);
    localStorage.setItem('qs_token', newToken);
    if (newUser === 'guest') {
      const now = Date.now().toString();
      localStorage.setItem('qs_guest_login_time', now);
      localStorage.setItem('qs_guest_last_login_date', now);
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
