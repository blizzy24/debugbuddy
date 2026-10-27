import { Logo } from './Logo';

export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-lg p-8">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Connect the dashboard to Supabase</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Copy <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[12px]">apps/dashboard/.env.example</code> to{' '}
          <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[12px]">apps/dashboard/.env</code>, fill in{' '}
          <code className="font-mono text-[12px]">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-[12px]">VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
