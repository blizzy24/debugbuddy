import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorAlert } from '../components/Alert';
import { ScoreMeter, SeverityBadge, StatusBadge } from '../components/Badges';
import { Button } from '../components/Button';
import { CodeBlock } from '../components/CodeBlock';
import { CopyButton } from '../components/CopyButton';
import { Dialog } from '../components/Dialog';
import { ChatIcon, ChevronRightIcon, GlobeIcon, KeyIcon, PlusIcon } from '../components/Icons';
import { JiraSettings } from '../components/JiraSettings';
import { PageLoader } from '../components/Spinner';
import { config } from '../lib/config';
import { embedSnippet, errorMessage, relativeTime, shortDate } from '../lib/format';
import { generateApiKey } from '../lib/keys';
import { supabase } from '../lib/supabase';
import type { ApiKey, Project, SessionWithReports } from '../lib/types';
import { NotFoundPage } from './NotFound';

const KEY_PLACEHOLDER = 'db_live_YOUR_KEY';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [sessions, setSessions] = useState<SessionWithReports[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The raw key exists only in memory, only for the key created during this visit.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadKeys = useCallback(async () => {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, project_id, key_prefix, name, last_used_at, revoked_at, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setKeys((data ?? []) as ApiKey[]);
  }, [id]);

  const loadSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, reports(readiness_score, severity, category)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setSessions((data ?? []) as SessionWithReports[]);
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
      if (!active) return;
      if (error) {
        setError(error.message);
        setProject(null);
        return;
      }
      setProject((data as Project | null) ?? null);
      if (data) await Promise.all([loadKeys(), loadSessions()]);
    })();
    return () => {
      active = false;
    };
  }, [id, loadKeys, loadSessions]);

  // Deep link from a session page: /projects/:id#jira
  useEffect(() => {
    if (project && location.hash === '#jira') {
      document.getElementById('jira')?.scrollIntoView({ block: 'start' });
    }
  }, [project, location.hash]);

  if (project === undefined) return <PageLoader />;
  if (project === null) return error ? <ErrorAlert message={error} /> : <NotFoundPage what="project" />;

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const snippetKey = freshKey ?? KEY_PLACEHOLDER;
  const snippet = embedSnippet(config.widgetUrl, config.apiUrl, snippetKey);
  const completed = sessions.filter((s) => s.status === 'completed').length;

  const deleteProject = async () => {
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) setError(error.message);
    else navigate('/projects');
  };

  return (
    <div>
      <nav className="flex items-center gap-1.5 text-sm text-stone-500" aria-label="Breadcrumb">
        <Link to="/projects" className="hover:text-ink">Projects</Link>
        <ChevronRightIcon className="h-3.5 w-3.5 text-stone-300" />
        <span className="truncate text-ink">{project.name}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-stone-600">
            Created {shortDate(project.created_at)} · {sessions.length} {sessions.length === 1 ? 'conversation' : 'conversations'} · {completed}{' '}
            {completed === 1 ? 'report' : 'reports'}
          </p>
        </div>
      </div>

      <div className="mt-6"><ErrorAlert message={error} /></div>

      {/* Install */}
      <section className="card mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="eyebrow">Install</p>
            <h2 className="mt-1 text-base font-semibold tracking-tight">Add the widget to your site</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Paste this before the closing <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[12px]">&lt;/body&gt;</code> tag. A
              launcher appears in the bottom-right corner.
            </p>
          </div>
          {!freshKey && (
            <Button variant="secondary" size="sm" onClick={() => setCreatingKey(true)}>
              <KeyIcon className="h-4 w-4" /> Create a key to fill this in
            </Button>
          )}
        </div>
        <div className="mt-5">
          <CodeBlock code={snippet} />
        </div>
        {!freshKey && (
          <p className="mt-3 text-[13px] text-stone-500">
            Keys are shown only once, so the snippet uses a placeholder. Replace{' '}
            <code className="font-mono text-[12px] text-ink-2">{KEY_PLACEHOLDER}</code> with your key, or create a new one.
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Sessions */}
        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Reports</h2>
              <p className="text-[13px] text-stone-500">Newest first</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadSessions()}>Refresh</Button>
          </div>
          {sessions.length === 0 ? <SessionsEmptyState hasKey={activeKeys.length > 0} /> : <SessionsTable sessions={sessions} />}
        </section>

        <div className="space-y-6">
          {/* Keys */}
          <section className="card">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight">API keys</h2>
              <Button variant="secondary" size="sm" onClick={() => setCreatingKey(true)}>
                <PlusIcon className="h-4 w-4" /> New key
              </Button>
            </div>
            {keys.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-stone-500">No keys yet. Create one to start receiving reports.</div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {keys.map((k) => (
                  <li key={k.id} className={`px-5 py-4 ${k.revoked_at ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{k.name || 'Untitled key'}</p>
                        <p className="mt-0.5 font-mono text-[12px] text-stone-500">{k.key_prefix}…</p>
                      </div>
                      {k.revoked_at ? (
                        <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-600">Revoked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRevoking(k)}
                          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                    <dl className="mt-2 flex gap-4 text-[12px] text-stone-500">
                      <div><dt className="inline">Created </dt><dd className="inline text-ink-2">{relativeTime(k.created_at)}</dd></div>
                      <div><dt className="inline">Last used </dt><dd className="inline text-ink-2">{relativeTime(k.last_used_at)}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <JiraSettings projectId={project.id} />

          <OriginsCard project={project} onSaved={setProject} />

          <section className="rounded-xl border border-dashed border-stone-300 p-5">
            <h2 className="text-sm font-semibold">Delete project</h2>
            <p className="mt-1 text-[13px] leading-5 text-stone-500">Removes its keys, conversations and reports. This can’t be undone.</p>
            <Button variant="danger" size="sm" className="mt-3" onClick={() => setDeleting(true)}>Delete project</Button>
          </section>
        </div>
      </div>

      <CreateKeyDialog
        open={creatingKey}
        projectId={project.id}
        onClose={() => setCreatingKey(false)}
        onCreated={(raw) => {
          setCreatingKey(false);
          setFreshKey(raw);
          setRevealKey(raw);
          void loadKeys();
        }}
      />

      <RevealKeyDialog rawKey={revealKey} onClose={() => setRevealKey(null)} />

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="Revoke this key?"
        description={
          <>
            Any site using <code className="font-mono text-[12px] text-ink">{revoking?.key_prefix}…</code> will stop working immediately. This can’t be
            undone.
          </>
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRevoking(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!revoking) return;
              const { error } = await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', revoking.id);
              if (error) setError(error.message);
              if (freshKey?.startsWith(revoking.key_prefix)) setFreshKey(null);
              setRevoking(null);
              void loadKeys();
            }}
          >
            Revoke key
          </Button>
        </div>
      </Dialog>

      <Dialog open={deleting} onClose={() => setDeleting(false)} title={`Delete ${project.name}?`} description="All keys, conversations and reports in this project will be permanently deleted.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => void deleteProject()}>Delete project</Button>
        </div>
      </Dialog>
    </div>
  );
}

function SessionsTable({ sessions }: { sessions: SessionWithReports[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-stone-100 text-[12px] text-stone-500">
            <th className="px-6 py-2.5 font-medium">Report</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Severity</th>
            <th className="px-3 py-2.5 font-medium">Readiness</th>
            <th className="px-6 py-2.5 text-right font-medium">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {sessions.map((s) => {
            const report = s.reports[0];
            return (
              <tr key={s.id} className="group relative transition hover:bg-stone-50/80">
                <td className="max-w-[280px] px-6 py-3.5">
                  <Link to={`/sessions/${s.id}`} className="block truncate font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none">
                    {s.original_report || 'Untitled report'}
                  </Link>
                  <span className="text-[12px] text-stone-500">
                    {s.iteration} {s.iteration === 1 ? 'round' : 'rounds'}
                    {report?.category ? ` · ${report.category}` : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3.5"><StatusBadge status={s.status} /></td>
                <td className="px-3 py-3.5"><SeverityBadge severity={report?.severity} /></td>
                <td className="px-3 py-3.5"><ScoreMeter score={report?.readiness_score} /></td>
                <td className="whitespace-nowrap px-6 py-3.5 text-right text-[13px] text-stone-500">{relativeTime(s.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SessionsEmptyState({ hasKey }: { hasKey: boolean }) {
  const steps = [
    { title: 'Create an API key', body: 'It’s shown once — keep it somewhere safe.', done: hasKey },
    { title: 'Paste the snippet into your site', body: 'One script tag, before </body>.', done: false },
    { title: 'Describe a bug in the widget', body: 'Answer the follow-ups; the report lands here.', done: false },
  ];
  return (
    <div className="px-6 py-14">
      <div className="mx-auto max-w-sm text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
          <ChatIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-5 text-base font-semibold tracking-tight">No reports yet</h3>
        <p className="mt-1.5 text-sm leading-6 text-stone-600">
          When a visitor describes a bug, DebugBuddy asks follow-up questions and files an engineering report here.
        </p>
      </div>
      <ol className="mx-auto mt-8 max-w-sm space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3.5 rounded-lg border border-stone-200/80 bg-stone-50/60 px-4 py-3">
            <span
              className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[12px] font-semibold ${
                step.done ? 'bg-accent text-white' : 'bg-white text-stone-500 ring-1 ring-stone-200'
              }`}
            >
              {step.done ? '✓' : i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{step.title}</p>
              <p className="text-[13px] text-stone-500">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OriginsCard({ project, onSaved }: { project: Project; onSaved: (p: Project) => void }) {
  const [value, setValue] = useState(project.allowed_origins.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const origins = value
      .split(/[\n,]/)
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    const invalid = origins.find((o) => !/^https?:\/\/[^/\s]+$/i.test(o));
    if (invalid) {
      setError(`“${invalid}” isn’t an origin. Use the form https://example.com`);
      setBusy(false);
      return;
    }
    const { data, error } = await supabase.from('projects').update({ allowed_origins: origins }).eq('id', project.id).select('*').single();
    setBusy(false);
    if (error) setError(errorMessage(error));
    else {
      onSaved(data as Project);
      setValue(origins.join('\n'));
      setSaved(true);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <GlobeIcon className="h-4 w-4 text-stone-400" />
        <h2 className="text-base font-semibold tracking-tight">Allowed origins</h2>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-stone-500">One per line. Leave empty to accept requests from any site.</p>
      <form onSubmit={save} className="mt-3 space-y-3">
        <textarea
          className="input min-h-[88px] font-mono text-[12.5px]"
          placeholder={'https://example.com\nhttp://localhost:5174'}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
        <ErrorAlert message={error} />
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-[13px] text-accent">Saved</span>}
          <Button type="submit" variant="secondary" size="sm" loading={busy}>Save origins</Button>
        </div>
      </form>
    </section>
  );
}

function CreateKeyDialog({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: (rawKey: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { key, prefix, hash } = await generateApiKey();
      const { error } = await supabase
        .from('api_keys')
        .insert({ project_id: projectId, key_hash: hash, key_prefix: prefix, name: name.trim() || null });
      if (error) throw error;
      setName('');
      onCreated(key);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Create an API key" description="The key is public — it ships in your site’s HTML — and only lets visitors send bug reports to this project.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="key-name" className="label">Name <span className="font-normal text-stone-400">(optional)</span></label>
          <input id="key-name" className="input" placeholder="Production site" maxLength={80} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <ErrorAlert message={error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create key</Button>
        </div>
      </form>
    </Dialog>
  );
}

function RevealKeyDialog({ rawKey, onClose }: { rawKey: string | null; onClose: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (rawKey) setAcknowledged(false);
  }, [rawKey]);

  return (
    <Dialog
      open={rawKey !== null}
      onClose={onClose}
      dismissible={false}
      size="lg"
      title="Copy your new API key"
      description={
        <>
          <strong className="font-semibold text-ink">This is the only time it will be shown.</strong> DebugBuddy stores only a hash, so the key cannot
          be retrieved again. If you lose it, revoke it and create a new one.
        </>
      }
    >
      {rawKey && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2 pl-4">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-[13px] text-ink">{rawKey}</code>
            <CopyButton text={rawKey} label="Copy key" variant="primary" />
          </div>
          <div>
            <p className="label">Embed snippet with this key</p>
            <CodeBlock code={embedSnippet(config.widgetUrl, config.apiUrl, rawKey)} />
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-[#0f766e]"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I’ve copied this key somewhere safe.
          </label>
          <div className="flex justify-end">
            <Button onClick={onClose} disabled={!acknowledged}>Done</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
