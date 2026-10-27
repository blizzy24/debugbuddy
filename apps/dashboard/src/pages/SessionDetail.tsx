import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorAlert } from '../components/Alert';
import { ScoreMeter, SeverityBadge, StatusBadge } from '../components/Badges';
import { ChatIcon, ChevronRightIcon } from '../components/Icons';
import { JiraIssuePanel } from '../components/JiraIssuePanel';
import { Markdown } from '../components/Markdown';
import { ReportActions } from '../components/ReportActions';
import { PageLoader } from '../components/Spinner';
import { fullDate, relativeTime } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Project, Report, Session } from '../lib/types';
import { NotFoundPage } from './NotFound';

type SessionDetail = Session & {
  reports: Report[];
  projects: Pick<Project, 'id' | 'name'> | null;
};

export function SessionDetailPage() {
  const { id = '' } = useParams();
  const [session, setSession] = useState<SessionDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('sessions')
      .select('*, reports(*), projects(id, name)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        setSession((data as SessionDetail | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (session === undefined) return <PageLoader />;
  if (session === null) return error ? <ErrorAlert message={error} /> : <NotFoundPage what="report" />;

  const report = [...session.reports].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  return (
    <div>
      <nav className="flex min-w-0 items-center gap-1.5 text-sm text-stone-500" aria-label="Breadcrumb">
        <Link to="/projects" className="hover:text-ink">Projects</Link>
        <ChevronRightIcon className="h-3.5 w-3.5 flex-none text-stone-300" />
        {session.projects && (
          <>
            <Link to={`/projects/${session.projects.id}`} className="truncate hover:text-ink">{session.projects.name}</Link>
            <ChevronRightIcon className="h-3.5 w-3.5 flex-none text-stone-300" />
          </>
        )}
        <span className="text-ink">Report</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {/* What the visitor said */}
          <section>
            <p className="eyebrow">Original report</p>
            <blockquote className="mt-3 rounded-2xl rounded-tl-md border border-stone-200/80 bg-white px-5 py-4 text-[15px] leading-7 text-ink-2 shadow-card">
              <p className="whitespace-pre-wrap">{session.original_report || 'No original report recorded.'}</p>
            </blockquote>
          </section>

          {/* What DebugBuddy produced */}
          {report ? (
            <article id="printable-report" className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-6 py-3 sm:px-8">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  <span className="text-[13px] font-semibold text-ink">Engineering report</span>
                  <span className="text-[13px] text-stone-400">· {fullDate(report.created_at)}</span>
                </div>
                <ReportActions markdown={report.content} createdAt={report.created_at} />
              </div>
              <div className="px-6 py-8 sm:px-10 sm:py-10">
                <Markdown source={report.content} />
              </div>
            </article>
          ) : (
            <div className="card flex flex-col items-center px-6 py-14 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <ChatIcon className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-base font-semibold tracking-tight">Still gathering details</h2>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-stone-600">
                The visitor is answering follow-up questions ({session.iteration} {session.iteration === 1 ? 'round' : 'rounds'} so far). The report
                will appear here once DebugBuddy has enough to go on.
              </p>
            </div>
          )}
        </div>

        {/* Facts */}
        <aside className="space-y-4 lg:pt-8 print:hidden">
          {report && <JiraIssuePanel report={report} projectId={session.project_id} />}
          <div className="card divide-y divide-stone-100">
            <Fact label="Status"><StatusBadge status={session.status} /></Fact>
            <Fact label="Severity"><SeverityBadge severity={report?.severity} /></Fact>
            <Fact label="Readiness"><ScoreMeter score={report?.readiness_score} size="lg" /></Fact>
            <Fact label="Category">
              <span className="text-sm capitalize text-ink-2">{report?.category ?? '—'}</span>
            </Fact>
            <Fact label="Iterations">
              <span className="font-mono text-sm tabular-nums text-ink-2">{session.iteration}</span>
            </Fact>
            <Fact label="Started">
              <span className="text-sm text-ink-2" title={fullDate(session.created_at)}>{relativeTime(session.created_at)}</span>
            </Fact>
            <Fact label="Last activity">
              <span className="text-sm text-ink-2" title={fullDate(session.updated_at)}>{relativeTime(session.updated_at)}</span>
            </Fact>
            <Fact label="Session">
              <span className="truncate font-mono text-[11.5px] text-stone-500">{session.id}</span>
            </Fact>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 px-5 py-3">
      <span className="flex-none text-[13px] text-stone-500">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
