import { FormEvent, useState } from 'react';
import { loginUrl } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { useAuth } from '../hooks/useAuth';

const GoogleG = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
  </svg>
);

export function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(new URLSearchParams(window.location.search).get('error') === 'login_failed' ? 'Google login failed. Please try again.' : '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) return setError('Enter your email and password');
    setBusy(true);
    try {
      await signIn(email.trim(), password, mode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[420px] rounded-xl border border-slate-100 bg-white p-8 shadow-sm">
        <h1 className="text-center text-3xl font-bold">{mode === 'login' ? 'Login' : 'Create account'}</h1>

        <a href={loginUrl} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-50 py-2.5 text-sm font-medium hover:bg-brand-100">
          <GoogleG /> Login with Google
        </a>

        <div className="my-5 flex items-center gap-3 text-[11px] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or sign up through email
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="space-y-3" noValidate>
          <Input label="Email ID" type="email" autoComplete="email" placeholder="Email ID" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'Password (min. 8 characters)' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={busy} className="mt-2 w-full py-3">
            {mode === 'login' ? 'Login' : 'Sign up'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create an account' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}
