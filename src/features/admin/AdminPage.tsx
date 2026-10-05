import { AdminDashboard } from './AdminDashboard';
import { AdminLogin } from './AdminLogin';
import { useAdminAuth } from './useAdminAuth';

export function AdminPage() {
  const auth = useAdminAuth();

  if (auth.loading) return <main className="admin-loading fullscreen">A confirmar acesso…</main>;
  if (!auth.user || !auth.isAdmin) return <AdminLogin error={auth.error} onLogin={auth.login} />;

  return <AdminDashboard email={auth.user.email ?? 'Administrador'} onLogout={auth.logout} />;
}
