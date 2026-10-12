import { useEffect, useLayoutEffect, useState } from 'react';
import { AdminDashboard } from './AdminDashboard';
import { AdminLogin } from './AdminLogin';
import { useAdminAuth } from './useAdminAuth';

interface AdminPageProps {
  storefrontUrl?: string;
}

export function AdminPage({ storefrontUrl = '/' }: AdminPageProps) {
  const auth = useAdminAuth();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const savedTheme = window.localStorage.getItem('theme');
      return savedTheme === 'dark'
        || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch {
      return false;
    }
  });

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDarkMode ? '#0f172a' : '#f3f6fb');
    try {
      window.localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // O tema continua funcional mesmo quando o armazenamento está bloqueado.
    }
  }, [isDarkMode]);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === 'theme' && (event.newValue === 'dark' || event.newValue === 'light')) {
        setIsDarkMode(event.newValue === 'dark');
      }
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  if (auth.loading) return <main className="admin-loading fullscreen">A confirmar acesso…</main>;
  if (!auth.user || !auth.isAdmin) {
    return (
      <AdminLogin
        error={auth.error}
        isDarkMode={isDarkMode}
        onLogin={auth.login}
        storefrontUrl={storefrontUrl}
        onToggleDarkMode={() => setIsDarkMode((current) => !current)}
      />
    );
  }

  return (
    <AdminDashboard
      email={auth.user.email ?? 'Administrador'}
      isDarkMode={isDarkMode}
      onLogout={auth.logout}
      onToggleDarkMode={() => setIsDarkMode((current) => !current)}
    />
  );
}
