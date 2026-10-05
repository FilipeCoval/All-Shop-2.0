import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { auth } from '../../lib/firebase';

const ADMIN_EMAILS = new Set([
  'filipe_coval_90@hotmail.com',
  'filipecoval90@gmail.com',
  'mcpoleca@gmail.com',
]);
const ADMIN_UIDS = new Set([
  'l0mJV5eevUSuF7NQ6TnllQA3KFd2',
  'cCreF8NjIHXhcFhQkTHLfEBuNS42',
  'TR5zcBdlvBWamXT12MDjSjsGVOV2',
]);
const hasAdminIdentity = (user: User | null) => Boolean(user?.email && ADMIN_EMAILS.has(user.email.trim().toLocaleLowerCase('pt')) && ADMIN_UIDS.has(user.uid));

export function useAdminAuth() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const isAdmin = useMemo(
    () => hasAdminIdentity(user),
    [user],
  );

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase não configurado.');
    setError(null);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!hasAdminIdentity(credential.user)) {
        await signOut(auth);
        throw new Error('Esta conta não tem acesso à administração.');
      }
    } catch (cause) {
      const message = cause instanceof Error && cause.message.includes('não tem acesso')
        ? cause.message
        : 'Email ou palavra-passe incorretos.';
      setError(message);
      throw new Error(message);
    }
  };

  return {
    user,
    isAdmin,
    loading,
    error,
    login,
    logout: () => auth ? signOut(auth) : Promise.resolve(),
  };
}
