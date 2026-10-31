import { useState } from 'react';
import { useActivity, useEmails, useReport } from '../api/queries';
import { formatMinutes, recentDowntimes, useSystemStatus } from '../api/system';
import { ActivityList } from '../components/ActivityList';
import { LazyBucketChart } from '../components/LazyBucketChart';
import { EmailTable } from '../components/EmailTable';
import { Card, Empty, PageHeader, QueryState, Stat, TextLink } from '../components/ui';
import { count, formatPercent } from '../lib/format';
import { useNow } from '../lib/now';

export function OverviewPage() {
  const now = useNow();
  const today = useReport('daily', undefined);
  const week = useReport('weekly', undefined);
  const activity = useActivity(10);
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
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="This week" className="lg:col-span-3">
          <QueryState query={week}>
            {(report) => (
              <>
                <p className="px-4 pt-3 text-sm text-muted">
                  {report.sent} sent · {formatPercent(report.openRate)} opened · {count(report.opens, 'open')} · {count(report.clicks, 'click')}
                </p>
                <LazyBucketChart buckets={report.buckets} period="WEEK" height={200} />
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
                <ActivityList items={page.items} now={now} />
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
