import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jiraApi, type JiraConfig } from '../lib/api';
import { errorMessage, fullDate, relativeTime } from '../lib/format';
import type { Report } from '../lib/types';
import { ErrorAlert } from './Alert';
import { Button } from './Button';
import { AlertIcon, ExternalIcon, JiraIcon } from './Icons';
import { Spinner } from './Spinner';

type Synced = Pick<Report, 'jira_issue_key' | 'jira_issue_url' | 'jira_synced_at'>;

/** Jira state for one report: link if synced, a create button if Jira is connected, a pointer to settings if not. */
export function JiraIssuePanel({ report, projectId }: { report: Report; projectId: string }) {
  const [synced, setSynced] = useState<Synced>({
    jira_issue_key: report.jira_issue_key,
    jira_issue_url: report.jira_issue_url,
    jira_synced_at: report.jira_synced_at,
  });
  const [config, setConfig] = useState<JiraConfig | undefined>(undefined);
  const [configError, setConfigError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSynced = Boolean(synced.jira_issue_key);

  useEffect(() => {
    if (isSynced) return;
    let active = true;
    jiraApi
      .get(projectId)
      .then((c) => active && setConfig(c))
      .catch(() => active && setConfigError(true));
    return () => {
      active = false;
    };
  }, [projectId, isSynced]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await jiraApi.createIssue(report.id);
      setSynced({ jira_issue_key: result.issueKey, jira_issue_url: result.issueUrl, jira_synced_at: result.syncedAt });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="card px-5 py-4 print:hidden">
      <div className="flex items-center gap-2">
        <JiraIcon className="h-4 w-4 text-[#2684ff]" />
        <h2 className="text-[13px] font-semibold text-ink">Jira</h2>
      </div>

      <div className="mt-3">
        {isSynced ? (
          <div>
            <a
              href={synced.jira_issue_url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[15px] font-medium text-ink hover:text-accent"
            >
              {synced.jira_issue_key}
              <ExternalIcon className="h-3.5 w-3.5 text-stone-400" />
            </a>
            {synced.jira_synced_at && (
              <p className="mt-0.5 text-[12px] text-stone-500" title={fullDate(synced.jira_synced_at)}>
                Created {relativeTime(synced.jira_synced_at)}
              </p>
            )}
          </div>
        ) : configError ? (
          <p className="text-[13px] text-stone-500">Couldn’t check the Jira settings for this project.</p>
        ) : config === undefined ? (
          <div className="flex text-stone-400">
            <Spinner className="h-4 w-4" />
          </div>
        ) : config.configured ? (
          <div className="space-y-3">
            {report.jira_sync_error && !error && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-5 text-amber-900">
                <AlertIcon className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <span>
                  Automatic creation failed: {report.jira_sync_error} You can create it manually.
                </span>
              </div>
            )}
            <Button variant="secondary" size="sm" className="w-full" onClick={() => void create()} loading={creating}>
              {creating ? 'Creating issue…' : 'Create Jira issue'}
            </Button>
            <p className="text-[12px] text-stone-500">
              In <span className="font-mono">{config.jiraProjectKey}</span> as a {config.issueType}.
            </p>
            <ErrorAlert message={error} />
          </div>
        ) : (
          <p className="text-[13px] leading-5 text-stone-500">
            Jira isn’t connected for this project.{' '}
            <Link to={`/projects/${projectId}#jira`} className="font-medium text-accent hover:text-accent-ink">
              Connect it in project settings
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
