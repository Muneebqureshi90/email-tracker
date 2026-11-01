import { useState } from 'react';
import { useActivity, useEmails, useReport } from '../api/queries';
import { formatMinutes, recentDowntimes, useSystemStatus } from '../api/system';
import { ActivityList } from '../components/ActivityList';
import { LazyBucketChart } from '../components/LazyBucketChart';
import { EmailTable } from '../components/EmailTable';
import { Card, Empty, PageHeader, QueryState, Stat, TextLink } from '../components/ui';
import { formatPercent } from '../lib/format';
import { useNow } from '../lib/now';

export function OverviewPage() {
  const now = useNow();
  const today = useReport('daily', undefined);
  const week = useReport('weekly', undefined);
  // The list scrolls, so it can hold more than fits on screen.
  const activity = useActivity(30);
  // The API pages in 25, 50 or 100; Overview shows the newest five.
  const recent = useEmails({ page: 0, size: 25 });

  return (
    <>
      <PageHeader title="Overview" description="Today and this week, in your time zone. New opens appear here without reloading." />
      <DowntimeBanner />
      <QueryState query={today}>
        {(report) => (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sent today" value={report.sent} />
            <Stat label="Opened" value={report.openedEmails} hint={`${formatPercent(report.openRate)} of today's emails`} />
            <Stat label="Opens today" value={report.opens} />
            <Stat label="Clicks today" value={report.clicks} />
          </div>
        )}
      </QueryState>
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card title="This week" className="lg:col-span-3">
          <QueryState query={week}>
            {(report) => (
              <>
                <dl className="grid grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-4">
                  <WeekFigure label="Sent" value={String(report.sent)} />
                  <WeekFigure label="Opened" value={formatPercent(report.openRate)} />
                  <WeekFigure label="Opens" value={String(report.opens)} dot="bg-accent" />
                  <WeekFigure label="Clicks" value={String(report.clicks)} dot="bg-(--mp-chart-2)" />
                </dl>
                <LazyBucketChart buckets={report.buckets} period="WEEK" height={260} />
              </>
            )}
          </QueryState>
        </Card>
        <Card title="Latest activity" actions={<TextLink to="/activity">All</TextLink>} className="lg:col-span-2">
          <QueryState query={activity}>
            {(page) =>
              page.items.length === 0 ? (
                <Empty title="No opens or clicks yet">They appear here within about a minute of happening.</Empty>
              ) : (
                // Focusable so the list can be scrolled with the keyboard.
                <div className="max-h-[26.5rem] overflow-y-auto overscroll-contain" tabIndex={0} role="region" aria-label="Latest activity, scrollable">
                  <ActivityList items={page.items} now={now} />
                </div>
              )
            }
          </QueryState>
        </Card>
      </div>
      <Card title="Recently sent" actions={<TextLink to="/emails">All emails</TextLink>} className="mt-6">
        <QueryState query={recent}>
          {(page) =>
            page.total === 0 ? (
              <Empty title="No tracked emails yet">
                Install the Chrome extension and connect it (docs\SETUP.md section 8), then send an email from Gmail.
              </Empty>
            ) : (
              <EmailTable emails={page.items.slice(0, 5)} now={now} />
            )
          }
        </QueryState>
      </Card>
    </>
  );
}

/** One of the week's totals above the chart; the dot ties it to the chart's colour. */
function WeekFigure({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="rounded-lg bg-raised px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const DISMISSED_KEY = 'mailpulse.downtimeBannerDismissed';

/** Shown when MailPulse was not running (PC off or asleep) in the last 7 days; dismissed for this browser session. */
function DowntimeBanner() {
  const status = useSystemStatus();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || !status.data) return null;
  const windows = recentDowntimes(status.data.downtimes, status.dataUpdatedAt, 7);
  if (windows.length === 0) return null;
  const total = windows.reduce((sum, window) => sum + window.minutes, 0);
  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Without session storage the banner still hides until the page is reloaded.
    }
    setDismissed(true);
  };
  return (
    <div role="status" className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p>
        MailPulse was off {windows.length === 1 ? 'once' : `${windows.length} times`} in the last 7 days ({formatMinutes(total)} in total). Opens
        during that time were not recorded. <TextLink to="/account">Details</TextLink>
      </p>
      <button type="button" className="btn btn-quiet" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}
