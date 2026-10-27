import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from './Button';
import { Logo } from './Logo';

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/projects" className="rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft">
            <Logo />
          </Link>
          <nav className="hidden sm:block">
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                `rounded-md px-2.5 py-1.5 text-sm font-medium transition ${isActive ? 'text-ink' : 'text-stone-500 hover:text-ink'}`
              }
            >
              Projects
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-sm text-stone-500 md:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
