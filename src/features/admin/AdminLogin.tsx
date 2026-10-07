import { FormEvent, useState } from 'react';
import { ArrowLeft, LockKeyhole, Loader2, Moon, Sun } from 'lucide-react';

interface AdminLoginProps {
  error: string | null;
  isDarkMode: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  onToggleDarkMode: () => void;
}

export function AdminLogin({ error, isDarkMode, onLogin, onToggleDarkMode }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch {
      // A mensagem é apresentada pelo estado de autenticação.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div className="admin-login-toolbar">
          <a href="/" className="back-link"><ArrowLeft size={17} /> Voltar à loja</a>
          <button className="admin-theme-button admin-login-theme" type="button" onClick={onToggleDarkMode} aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'} aria-pressed={isDarkMode} title={isDarkMode ? 'Modo claro' : 'Modo escuro'}>
            {isDarkMode ? <Sun /> : <Moon />}
          </button>
        </div>
        <span className="admin-login-icon"><LockKeyhole /></span>
        <p className="eyebrow">Área reservada</p>
        <h1>Administração</h1>
        <p>Entre com uma conta de administrador para consultar a nova dashboard.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Palavra-passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="login-error">{error}</div>}
          <button className="primary-button" disabled={submitting}>
            {submitting ? <><Loader2 className="spin" /> A entrar…</> : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
