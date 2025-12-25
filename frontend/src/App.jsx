import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from './components/Header.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import History from './pages/History.jsx';
import Favorites from './pages/Favorites.jsx';
import Bazi from './pages/Bazi.jsx';
import Tarot from './pages/Tarot.jsx';
import Iching from './pages/Iching.jsx';
import Zodiac from './pages/Zodiac.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language || 'en-US';
  }, [i18n.language]);

  return (
    <div className="min-h-screen">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/bazi" element={<Bazi />} />
        <Route path="/tarot" element={<Tarot />} />
        <Route path="/iching" element={<Iching />} />
        <Route path="/zodiac" element={<Zodiac />} />
        <Route path="/404" element={<NotFound />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <ProtectedRoute>
              <Favorites />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
