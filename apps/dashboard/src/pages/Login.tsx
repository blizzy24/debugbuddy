import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorAlert } from '../components/Alert';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { PageLoader } from '../components/Spinner';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/format';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (loading) return <PageLoader />;
  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/projects';
    return <Navigate to={from} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice('Check your inbox to confirm your email, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-2 text-sm text-stone-600">
            {mode === 'signin' ? 'Sign in to read your reports and manage projects.' : 'Start turning vague bug reports into fixable ones.'}
          </p>

          <div className="mt-8 grid grid-cols-2 rounded-lg bg-stone-200/60 p-1 text-sm font-medium" role="tablist">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`rounded-md py-1.5 transition ${mode === m ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'}`}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'signup' && <p className="mt-1.5 text-xs text-stone-500">At least 6 characters.</p>}
            </div>
            <ErrorAlert message={error} />
            {notice && (
              <div className="rounded-lg border border-accent/20 bg-accent-soft px-3.5 py-2.5 text-sm text-accent-ink">{notice}</div>
            )}
            <Button type="submit" className="w-full" loading={busy}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,rgba(52,211,194,.18),transparent_70%)]" />
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="eyebrow !text-stone-400">From this</p>
          <div className="mt-3 max-w-md rounded-2xl rounded-bl-md bg-white/10 px-5 py-4 text-[15px] leading-7 text-stone-100">
            “The checkout button doesn’t work sometimes??”
          </div>
          <p className="eyebrow mt-10 !text-stone-400">To this</p>
          <div className="mt-3 max-w-md overflow-hidden rounded-2xl bg-white shadow-lift">
            <div className="flex items-center justify-between bg-accent px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
              Engineering report <span className="rounded-full bg-white/15 px-2 py-0.5 font-mono normal-case tracking-normal">82/100</span>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm leading-6 text-ink-2">
              <p><strong className="text-ink">Severity:</strong> High · <strong className="text-ink">Subsystem:</strong> Payments</p>
              <p className="text-stone-600">Checkout submit is a no-op on Safari 17 when a saved card is selected; the request is never sent.</p>
              <ul className="space-y-1.5">
                {['Reproduce on Safari 17 with a saved card', 'Inspect the submit handler for a swallowed promise rejection'].map((t) => (
                  <li key={t} className="flex gap-2.5"><span className="mt-1 h-4 w-4 flex-none rounded border-[1.5px] border-stone-300" />{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
