/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router';
import { useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Category from './pages/Category';
import Details from './pages/Details';
import Admin from './pages/Admin';
import Watchlist from './pages/Watchlist';
import Layout from './components/Layout';
import AuthProvider, { useAuth } from './context/AuthContext';
import Bot from './components/Bot';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (requireAdmin && user !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    const faviconUrl = import.meta.env.VITE_SITE_FAVICON;
    if (faviconUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = faviconUrl;
    }

    const description = import.meta.env.VITE_SITE_DESCRIPTION;
    if (description) {
      let meta = document.querySelector("meta[name='description']") as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.getElementsByTagName('head')[0].appendChild(meta);
      }
      meta.content = description;
    }
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="category/:name" element={<Category />} />
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
          </Route>

          <Route path="/" element={<Layout />}>
            <Route path="home/*" element={<Details />} />
          </Route>
        </Routes>
        <Bot />
      </Router>
    </AuthProvider>
  );
}
