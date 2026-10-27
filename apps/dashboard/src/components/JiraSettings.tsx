import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ATLASSIAN_TOKEN_URL, jiraApi, type JiraConfig, type JiraConfigInput } from '../lib/api';
import { errorMessage } from '../lib/format';
import { ErrorAlert } from './Alert';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { CheckIcon, ExternalIcon, JiraIcon } from './Icons';
import { Spinner } from './Spinner';
import { Switch } from './Switch';

type Configured = Extract<JiraConfig, { configured: true }>;
type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; displayName: string } | { kind: 'error'; message: string };

interface FormState {
  siteUrl: string;
  email: string;
  apiToken: string;
  jiraProjectKey: string;
  issueType: string;
}

const emptyForm: FormState = { siteUrl: '', email: '', apiToken: '', jiraProjectKey: '', issueType: 'Bug' };

function formFrom(config: Configured | null): FormState {
  if (!config) return emptyForm;
  return { siteUrl: config.siteUrl, email: config.email, apiToken: '', jiraProjectKey: config.jiraProjectKey, issueType: config.issueType };
}

/** Only send what the user filled in; an empty token means "keep the stored one". */
function toInput(form: FormState): JiraConfigInput {
  const input: JiraConfigInput = {
    siteUrl: form.siteUrl.trim(),
    email: form.email.trim(),
    jiraProjectKey: form.jiraProjectKey.trim(),
    issueType: form.issueType.trim() || 'Bug',
  };
  if (form.apiToken.trim()) input.apiToken = form.apiToken.trim();
  return input;
}

export function JiraSettings({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<JiraConfig | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let active = true;
    jiraApi
      .get(projectId)
      .then((c) => active && setConfig(c))
      .catch((err) => active && setLoadError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [projectId]);

  const configured = config?.configured ? config : null;

  return (
    <section id="jira" className="card scroll-mt-24">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <JiraIcon className="h-4 w-4 text-[#2684ff]" />
          <h2 className="text-base font-semibold tracking-tight">Jira</h2>
        </div>
        {configured && !editing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Connected
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        {config === undefined && !loadError && (
          <div className="flex justify-center py-4 text-stone-400">
            <Spinner />
          </div>
        )}
        {loadError && <ErrorAlert message={`Couldn’t load Jira settings. ${loadError}`} />}

        {config && !configured && !editing && (
          <div>
            <p className="text-[13px] leading-5 text-stone-600">
              Send engineering reports to Jira as issues, with the full report as the description, severity as priority, and a{' '}
              <code className="font-mono text-[12px] text-ink-2">debugbuddy</code> label.
            </p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setEditing(true)}>
              Connect Jira
            </Button>
          </div>
        )}

        {config && editing && (
          <JiraForm
            projectId={projectId}
            existing={configured}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              setConfig(next);
              setEditing(false);
            }}
          />
        )}

        {configured && !editing && (
          <ConnectedView
            projectId={projectId}
            config={configured}
            onChange={setConfig}
            onEdit={() => setEditing(true)}
            onDisconnect={() => setDisconnecting(true)}
          />
        )}
      </div>

      <Dialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        title="Disconnect Jira?"
        description="The saved credentials are deleted. Issues already created stay in Jira, and reports keep their links."
      >
        <DisconnectActions
          projectId={projectId}
          onCancel={() => setDisconnecting(false)}
          onDone={(next) => {
            setConfig(next);
            setDisconnecting(false);
          }}
        />
      </Dialog>
    </section>
  );
}

function ConnectedView({
  projectId,
  config,
  onChange,
  onEdit,
  onDisconnect,
}: {
  projectId: string;
  config: Configured;
  onChange: (c: JiraConfig) => void;
  onEdit: () => void;
  onDisconnect: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  const toggle = async (next: boolean) => {
    setSaving(true);
    setError(null);
    onChange({ ...config, autoCreate: next }); // optimistic
    try {
      onChange(await jiraApi.save(projectId, { autoCreate: next }));
    } catch (err) {
      onChange({ ...config, autoCreate: !next });
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTest({ kind: 'testing' });
    try {
      const { displayName } = await jiraApi.test(projectId, {});
      setTest({ kind: 'ok', displayName });
    } catch (err) {
      setTest({ kind: 'error', message: errorMessage(err) });
    }
  };

  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-[13px]">
        <Row label="Site">
          <a href={config.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink hover:text-accent">
            {config.siteUrl.replace(/^https:\/\//, '')}
            <ExternalIcon className="h-3.5 w-3.5 text-stone-400" />
          </a>
        </Row>
        <Row label="Project">
          <span className="font-mono text-[12.5px] text-ink">{config.jiraProjectKey}</span>
        </Row>
        <Row label="Issue type">
          <span className="text-ink">{config.issueType}</span>
        </Row>
        <Row label="Account">
          <span className="truncate text-ink-2">{config.email}</span>
        </Row>
      </dl>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50/70 px-3.5 py-3">
        <div>
          <p id="jira-auto-label" className="text-[13px] font-medium text-ink">
            Create issues automatically
          </p>
          <p id="jira-auto-desc" className="mt-0.5 text-[12px] leading-5 text-stone-500">
            Every future report on this project becomes a Jira issue as soon as it’s produced.
          </p>
        </div>
        <Switch checked={config.autoCreate} onChange={(v) => void toggle(v)} disabled={saving} labelledBy="jira-auto-label" describedBy="jira-auto-desc" />
      </div>

      <ErrorAlert message={error} />
      <TestResult state={test} />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={() => void runTest()} loading={test.kind === 'testing'}>
          Test connection
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="!text-red-700 hover:!bg-red-50" onClick={onDisconnect}>
            Disconnect
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

function JiraForm({
  projectId,
  existing,
  onCancel,
  onSaved,
}: {
  projectId: string;
  existing: Configured | null;
  onCancel: () => void;
  onSaved: (c: JiraConfig) => void;
}) {
  const [form, setForm] = useState<FormState>(() => formFrom(existing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setTest({ kind: 'idle' });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await jiraApi.save(projectId, toInput(form)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTest({ kind: 'testing' });
    try {
      const { displayName } = await jiraApi.test(projectId, toInput(form));
      setTest({ kind: 'ok', displayName });
    } catch (err) {
      setTest({ kind: 'error', message: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={save} className="space-y-3.5">
      <div>
        <label htmlFor="jira-site" className="label">Site URL</label>
        <input id="jira-site" className="input" placeholder="https://your-company.atlassian.net" required value={form.siteUrl} onChange={set('siteUrl')} autoComplete="off" spellCheck={false} />
      </div>
      <div>
        <label htmlFor="jira-email" className="label">Account email</label>
        <input id="jira-email" type="email" className="input" placeholder="you@company.com" required value={form.email} onChange={set('email')} autoComplete="off" />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="jira-token" className="label">API token</label>
          <a href={ATLASSIAN_TOKEN_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-ink">
            Create a token <ExternalIcon className="h-3 w-3" />
          </a>
        </div>
        <input
          id="jira-token"
          type="password"
          className="input font-mono"
          placeholder={existing ? 'Leave blank to keep the current token' : 'Paste your API token'}
          required={!existing}
          value={form.apiToken}
          onChange={set('apiToken')}
          autoComplete="new-password"
          spellCheck={false}
        />
        <p className="mt-1.5 text-[12px] leading-5 text-stone-500">Encrypted before it’s stored, and never sent back to the browser.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="jira-key" className="label">Project key</label>
          <input id="jira-key" className="input font-mono uppercase" placeholder="BUG" required value={form.jiraProjectKey} onChange={set('jiraProjectKey')} autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor="jira-type" className="label">Issue type</label>
          <input id="jira-type" className="input" placeholder="Bug" value={form.issueType} onChange={set('issueType')} autoComplete="off" />
        </div>
      </div>

      <TestResult state={test} />
      <ErrorAlert message={error} />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => void runTest()} loading={test.kind === 'testing'}>
          Test connection
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            {existing ? 'Save changes' : 'Connect'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TestResult({ state }: { state: TestState }) {
  if (state.kind === 'ok') {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">
        <CheckIcon className="h-4 w-4 flex-none" />
        <span>
          Connected as <strong className="font-semibold">{state.displayName}</strong>
        </span>
      </div>
    );
  }
  if (state.kind === 'error') return <ErrorAlert message={state.message} />;
  return null;
}

function DisconnectActions({ projectId, onCancel, onDone }: { projectId: string; onCancel: () => void; onDone: (c: JiraConfig) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <ErrorAlert message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              onDone(await jiraApi.remove(projectId));
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <dt className="flex-none text-stone-500">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
