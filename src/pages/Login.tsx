import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import axios from 'axios';

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

  useEffect(() => {
    if (localStorage.getItem('guest_timeout') === 'true') {
      setError('Guest session expired. Sign up for the website plan.');
      localStorage.removeItem('guest_timeout');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Proxy request to our backend
      const res = await axios.post('/api/auth/login', { username, password });
      if (res.data.code === 200 && res.data.data?.token) {
        const token = res.data.data.token;
        
        // Test the token to see if the user is disabled using fetch to bypass interceptors
        try {
          const testRes = await fetch('/api/fs/list', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': token 
            },
            body: JSON.stringify({ reqPath: '/', password: '' })
          });
          const testData = await testRes.json();
          
          if (testData.code === 401 && testData.message?.toLowerCase().includes('disabled')) {
            setError('Subscription Expired');
            setLoading(false);
            return;
          }
        } catch (testErr) {
          console.error("Test token error:", testErr);
        }

        login(username, token);
        navigate('/');
      } else {
        let errorMsg = res.data.message || 'Login failed';
        if (errorMsg.toLowerCase().includes('disabled')) {
          errorMsg = 'Subscription Expired';
        }
        setError(errorMsg);
      }
    } catch (err: any) {
      let errorMsg = err.response?.data?.message || err.message || 'An error occurred';
      if (errorMsg.toLowerCase().includes('disabled')) {
        errorMsg = 'Subscription Expired';
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080a] flex items-center justify-center p-4">
      <div className="bg-[#1a1a22]/80 backdrop-blur p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/5">
        <div className="flex flex-col items-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-6 shrink-0 rounded-2xl" />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-600/20 mb-6 shrink-0">
               <span className="font-bold text-white text-3xl">S</span>
            </div>
          )}
          <h1 className="text-3xl font-bold text-white tracking-tight">{siteName}</h1>
          <p className="text-gray-400 mt-2 text-sm">Sign in to your <a href="https://shutter.ng" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors font-semibold">SHUTTER</a> account</p>
        </div>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl mb-6 text-sm">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Username</label>
            <input 
              type="text" 
              required
              className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={username} 
              onChange={e => setUsername(e.target.value)} 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:border-purple-600/50 transition-colors"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
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
              onClick={() => {
                login('guest', 'guest-token');
                navigate('/');
              }}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-semibold py-1.5 px-4 rounded-full transition-all disabled:opacity-50"
            >
              Sign in as guest
            </button>
          </div>
          
          <div className="text-center mt-6">
            <p className="text-gray-400 text-sm">
              Need a WEBSITE account? <a href="https://shutter.ng" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors font-semibold">Sign up now</a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
