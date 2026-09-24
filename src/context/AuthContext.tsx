import axios from 'axios';
import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: string | null;
  token: string | null;
  login: (user: string, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

let isTerminatingSession = false;

function terminateSessionAndRedirect(customLoginError?: string) {
  if (isTerminatingSession) return;
  isTerminatingSession = true;
  localStorage.removeItem('qs_user');
  localStorage.removeItem('qs_token');
  localStorage.removeItem('qs_guest_login_time');
  localStorage.removeItem('qs_guest_last_login_date');
  localStorage.removeItem('qs_server_boot_id');
  
  const savedLoginError = customLoginError || sessionStorage.getItem('login_error');
  sessionStorage.clear();
  if (savedLoginError) {
    sessionStorage.setItem('login_error', savedLoginError);
  }

  // If already on the login page, do NOT force reload with window.location.href!
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  } else {
    isTerminatingSession = false;
  }
}

// Global response interceptor for server boot ID tracking & token invalidation
axios.interceptors.response.use(
  response => {
    const url = response.config?.url || '';
    // Never trigger global session termination on login/guest_login endpoints!
    if (url.includes('/api/auth/login') || url.includes('/api/auth/guest_login')) {
      return response;
    }

    const currentBootId = response.headers?.['x-server-boot-id'];
    if (currentBootId) {
      const storedBootId = localStorage.getItem('qs_server_boot_id');
      if (!storedBootId) {
        localStorage.setItem('qs_server_boot_id', currentBootId);
      } else if (storedBootId !== currentBootId) {
        localStorage.setItem('qs_server_boot_id', currentBootId);
        terminateSessionAndRedirect();
        return Promise.reject(new Error("Server restarted or rebuilt, terminating session..."));
      }
    }

    const resData = response.data;
    const isString = typeof resData === 'string';
    const resString = isString ? resData.toLowerCase() : '';
    const resMsg = (resData?.message && typeof resData.message === 'string') ? resData.message.toLowerCase() : '';

    const isDisabled = resData?.disabled === true || resString.includes('disabled') || resMsg.includes('disabled') || resString.includes('subscription') || resMsg.includes('subscription');
    const isAuthEndpoint = url.includes('/api/auth/me') || url.includes('/api/me');
    const isSessionInvalidated = resString.includes('invalidated') || resMsg.includes('invalidated');
    const isUnauthorized = resData?.code === 401;
    const isAuthForbidden = isAuthEndpoint && resData?.code === 403;

    if (resData && (isDisabled || isSessionInvalidated || isUnauthorized || isAuthForbidden)) {
      terminateSessionAndRedirect(isDisabled ? 'Subscription is Expired' : undefined);
      const err: any = new Error(isDisabled ? 'Subscription is Expired' : (resData.message || 'Unauthorized'));
      err.response = response;
      return Promise.reject(err);
    }
    return response;
  },
  async error => {
    const url = error.config?.url || '';
    // Never trigger global session termination on login/guest_login endpoints!
    if (url.includes('/api/auth/login') || url.includes('/api/auth/guest_login')) {
      return Promise.reject(error);
    }

    const currentBootId = error.response?.headers?.['x-server-boot-id'];
    if (currentBootId) {
      const storedBootId = localStorage.getItem('qs_server_boot_id');
      if (!storedBootId) {
        localStorage.setItem('qs_server_boot_id', currentBootId);
      } else if (storedBootId !== currentBootId) {
        localStorage.setItem('qs_server_boot_id', currentBootId);
        terminateSessionAndRedirect();
        return Promise.reject(new Error("Server restarted or rebuilt, terminating session..."));
      }
    }

    const config = error?.config;
    if (error?.response?.status === 429 && config && (config._retryCount || 0) < 3) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = config._retryCount * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return axios(config);
    }

    const errData = error.response?.data;
    const isString = typeof errData === 'string';
    const errString = isString ? errData.toLowerCase() : '';
    const errMsg = (errData?.message && typeof errData.message === 'string') ? errData.message.toLowerCase() : '';

    const isDisabled = errData?.disabled === true || errString.includes('disabled') || errMsg.includes('disabled') || errString.includes('subscription') || errMsg.includes('subscription');
    const isAuthEndpoint = url.includes('/api/auth/me') || url.includes('/api/me');
    const isSessionInvalidated = errString.includes('invalidated') || errMsg.includes('invalidated');
    const isUnauthorized = error.response?.status === 401;
    const isAuthForbidden = isAuthEndpoint && error.response?.status === 403;

    if (error.response && (isDisabled || isSessionInvalidated || isUnauthorized || isAuthForbidden)) {
      terminateSessionAndRedirect(isDisabled ? 'Subscription is Expired' : undefined);
    }
    return Promise.reject(error);
  }
);

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
      // Immediate session check on mount to detect server reboot instantly
      const checkAuth = async () => {
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
      };

      checkAuth();
      interval = setInterval(checkAuth, 60000);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'qs_token' && e.newValue === null) {
        logout();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user, token]);

  const login = (newUser: string, newToken: string) => {
    isTerminatingSession = false;
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
    localStorage.removeItem('qs_guest_login_time');
    localStorage.removeItem('qs_guest_last_login_date');
    sessionStorage.removeItem('shindex-featured-items-session');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
