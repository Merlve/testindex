/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router';
import { useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Category from './pages/Category';
import RecentlyAddedPage from './pages/RecentlyAddedPage';
import Offline from "./pages/Offline";
import Details from './pages/Details';
import Admin from './pages/Admin';
import Users from './pages/Users';
import Watchlist from './pages/Watchlist';
import Collection from './pages/Collection';
import CollectionsPage from './pages/CollectionsPage';
import Layout from './components/Layout';
import AuthProvider, { useAuth } from './context/AuthContext';
import Bot from './components/Bot';
import { useKeyboardNavigation } from './utils/keyboardNavigation';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, token } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  if (requireAdmin && user !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  useKeyboardNavigation();
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
            <Route path="collection/:id" element={<Collection />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="recently-added" element={<RecentlyAddedPage />} />
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="offline" element={<Offline />} />
            <Route path="admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
            <Route path="users" element={<ProtectedRoute requireAdmin><Users /></ProtectedRoute>} />
            <Route path="home/*" element={<Details />} />
          </Route>
        </Routes>
        <Bot />
      </Router>
    </AuthProvider>
  );
}
