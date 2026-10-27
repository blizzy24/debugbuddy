import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorAlert } from '../components/Alert';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ArrowRightIcon, PlusIcon, ReportIcon } from '../components/Icons';
import { PageLoader } from '../components/Spinner';
import { useAuth } from '../lib/auth';
import { errorMessage, relativeTime } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Project } from '../lib/types';

type ProjectRow = Project & { sessions: { count: number }[] };

export function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*, sessions(count)')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setProjects((data ?? []) as ProjectRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-stone-600">Each project is one website with its own widget key and reports.</p>
        </div>
        {projects && projects.length > 0 && (
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" /> New project
          </Button>
        )}
      </div>

      <div className="mt-8">
        <ErrorAlert message={error} />
        {!projects && !error && <PageLoader />}
        {projects && projects.length === 0 && (
          <div className="card flex flex-col items-center px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
              <ReportIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold tracking-tight">Create your first project</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-600">
              A project gives you an API key and a one-line snippet. Paste it into your site and visitors can start reporting bugs.
            </p>
            <Button className="mt-6" onClick={() => setCreating(true)}>
              <PlusIcon className="h-4 w-4" /> New project
            </Button>
          </div>
        )}
        {projects && projects.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const count = p.sessions[0]?.count ?? 0;
              return (
                <li key={p.id}>
                  <Link
                    to={`/projects/${p.id}`}
                    className="card group flex h-full flex-col p-5 transition hover:-translate-y-px hover:border-stone-300 hover:shadow-lift focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft motion-reduce:hover:translate-y-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-semibold tracking-tight text-ink">{p.name}</h2>
                      <ArrowRightIcon className="h-4 w-4 flex-none text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                    </div>
                    <p className="mt-1 truncate text-sm text-stone-500">
                      {p.allowed_origins.length ? p.allowed_origins.join(', ') : 'Any origin'}
                    </p>
                    <div className="mt-6 flex items-center justify-between border-t border-stone-100 pt-4 text-[13px] text-stone-500">
                      <span>
                        <span className="font-medium tabular-nums text-ink">{count}</span> {count === 1 ? 'conversation' : 'conversations'}
                      </span>
                      <span>Created {relativeTime(p.created_at)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CreateProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        ownerId={user?.id ?? ''}
        onCreated={(id) => navigate(`/projects/${id}`)}
      />
    </div>
  );
}

function CreateProjectDialog({
  open,
  onClose,
  ownerId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({ name: name.trim(), owner_id: ownerId })
        .select('id')
        .single();
      if (error) throw error;
      setName('');
      onCreated((data as { id: string }).id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="New project" description="Usually one per website or app. You can restrict allowed origins later.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="project-name" className="label">Name</label>
          <input
            id="project-name"
            className="input"
            placeholder="Acme Storefront"
            required
            maxLength={80}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <ErrorAlert message={error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!name.trim()}>Create project</Button>
        </div>
      </form>
    </Dialog>
  );
}
