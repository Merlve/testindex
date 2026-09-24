import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useQueryClient } from "@tanstack/react-query";
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const logoUrl = import.meta.env.VITE_SITE_LOGO;
  const siteName = import.meta.env.VITE_SITE_NAME || 'SHUTTER!';

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const savedError = sessionStorage.getItem('login_error');
    if (savedError) {
      setError(savedError);
      sessionStorage.removeItem('login_error');
    } else if (localStorage.getItem('guest_timeout') === 'true') {
      setError('Guest session expired. Sign up for the website plan.');
      localStorage.removeItem('guest_timeout');
    }
  }, []);

  const handleGuestLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/guest_login');
      if (res.data.success) {
        login('guest', res.data.token);
        queryClient.clear();
        sessionStorage.setItem('justLoggedIn', 'true');
        sessionStorage.setItem('showWhatsApp', 'true');
        const from = location.state?.from || '/';
        navigate(from);
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError(err.response.data.error || 'Too many attempts.');
      } else {
        setError('Guest access failed. Server might be offline.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Proxy request to our backend
      const res = await axios.post('/api/auth/login', { username, password });
      const resData = res.data;
      const resMsg = (resData?.message || (typeof resData === 'string' ? resData : '') || '').toLowerCase();

      // Check if backend reported account disabled / subscription expired
      if (
        resData?.disabled === true ||
        resData?.code === 403 ||
        resMsg.includes('disabled') ||
        resMsg.includes('expired') ||
        resMsg.includes('subscription')
      ) {
        setError('Subscription is Expired');
        setLoading(false);
        return;
      }

      if (resData?.code === 200 && resData?.data?.token) {
        const token = resData.data.token;
        
        // Test the token to see if the user is disabled using fetch to bypass interceptors
        try {
          const testRes = await fetch('/api/auth/me', {
            headers: { 'Authorization': token }
          });
          const testContentType = testRes.headers.get('content-type') || '';
          if (testContentType.includes('application/json')) {
            const testData = await testRes.json();
            const testMsg = (testData?.message || '').toLowerCase();
            if (
              testData?.disabled ||
              testData?.data?.disabled ||
              testMsg.includes('disabled') ||
              testMsg.includes('expired') ||
              testMsg.includes('subscription')
            ) {
              setError('Subscription is Expired');
              setLoading(false);
              return;
            }
          }

          const fsRes = await fetch('/api/fs/list', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': token 
            },
            body: JSON.stringify({ path: '/', password: '', page: 1, per_page: 1 })
          });
          const fsContentType = fsRes.headers.get('content-type') || '';
          if (fsContentType.includes('application/json')) {
            const fsData = await fsRes.json();
            const fsMsg = (fsData?.message || '').toLowerCase();
            if (
              fsData?.disabled ||
              fsMsg.includes('disabled') ||
              fsMsg.includes('expired') ||
              fsMsg.includes('subscription')
            ) {
              setError('Subscription is Expired');
              setLoading(false);
              return;
            }
          }
        } catch (testErr) {
          // Token verification fallback encountered non-fatal error; proceed to login
        }

        login(username, token);
        sessionStorage.setItem('justLoggedIn', 'true');
        sessionStorage.setItem('showWhatsApp', 'true');
        const from = location.state?.from || '/';
        navigate(from);
      } else {
        let errorMsg = resData?.message || 'Login failed';
        const lower = errorMsg.toLowerCase();
        if (
          resData?.disabled ||
          lower.includes('disabled') ||
          lower.includes('expired') ||
          lower.includes('subscription')
        ) {
          errorMsg = 'Subscription is Expired';
        }
        setError(errorMsg);
      }
    } catch (err: any) {
      const errData = err.response?.data;
      let errorMsg = errData?.message || (typeof errData === 'string' ? errData : '') || err.message || 'An error occurred';
      const lower = errorMsg.toLowerCase();
      if (
        errData?.disabled ||
        lower.includes('disabled') ||
        lower.includes('expired') ||
        lower.includes('subscription')
      ) {
        errorMsg = 'Subscription is Expired';
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] flex items-center justify-center p-4 relative">
      {/* Floating Top Right Theme Action Pill */}
      <div 
        id="floating-top-right-nav"
        className="fixed top-4 right-4 md:right-6 z-40 flex items-center gap-3 px-3.5 py-2 rounded-full border backdrop-blur-xl backdrop-saturate-[180%] bg-white/50 border-white/60 text-gray-900 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:bg-black/60 dark:border-white/20 dark:text-white transition-all duration-300"
      >
        <ThemeToggle align="right" />
      </div>

      <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 backdrop-blur p-8 rounded-2xl shadow-2xl w-full max-w-md border border-black/5 dark:border-white/5">
        <div className="flex flex-col items-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-6 shrink-0 rounded-2xl" />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-600/20 mb-6 shrink-0">
               <span className="font-bold text-black dark:text-white text-3xl">S</span>
            </div>
          )}
          <h1 className="text-3xl font-bold text-black dark:text-white tracking-tight">{siteName}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm">Sign in to your <a href="https://shutter.ng" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors font-semibold">SHUTTER</a> account</p>
        </div>
        
        {error && (
          <div 
            role="alert"
            aria-live="assertive"
            className="bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-6 text-sm font-medium flex items-center gap-2.5 shadow-sm"
          >
            <AlertCircle size={18} className="shrink-0 text-red-500" />
            <span className="flex-1 text-left break-words">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wider">Username</label>
            <input 
              type="text" 
              required
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={username} 
              onChange={e => setUsername(e.target.value)} 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wider">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 pr-12 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-400 text-black font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
          
          <div className="flex justify-center mt-3">
            <button 
              type="button" 
              disabled={loading}
              onClick={handleGuestLogin}
              className="bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 text-gray-700 dark:text-gray-300 text-xs font-semibold py-1.5 px-4 rounded-full transition-all disabled:opacity-50"
            >
              Sign in as guest
            </button>
          </div>
          
          <div className="text-center mt-6">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Need a WEBSITE account? <a href="https://shutter.ng" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors font-semibold">Sign up now</a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
