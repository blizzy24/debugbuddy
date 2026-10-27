import { Link } from 'react-router-dom';

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="font-mono text-sm text-stone-400">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">This {what} doesn’t exist</h1>
      <p className="mt-2 text-sm text-stone-600">It may have been deleted, or it belongs to another account.</p>
      <Link to="/projects" className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-ink">
        Back to projects
      </Link>
    </div>
  );
}
