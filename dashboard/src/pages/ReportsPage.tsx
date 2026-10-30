import { useSearchParams } from 'react-router';
import { useReport } from '../api/queries';
import { Segmented } from '../components/controls';
import { DatePicker } from '../components/DatePicker';
import { LazyBucketChart } from '../components/LazyBucketChart';
import { Card, Empty, PageHeader, QueryState, Stat, TextLink } from '../components/ui';
import { count, formatPercent, todayInZone } from '../lib/format';

/** Monday of the week that contains a YYYY-MM-DD date. */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const period = params.get('period') === 'weekly' ? 'weekly' : 'daily';
  const date = params.get('date') ?? undefined;
  const report = useReport(period, period === 'weekly' && date ? mondayOf(date) : date);

  const set = (next: { period?: string; date?: string }) => {
    const merged = { period, ...(date ? { date } : {}), ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, value]) => value)));
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Daily and weekly numbers in your time zone (Settings). Only counted opens and clicks are included."
        actions={
          <>
            <Segmented
              label="Period"
              value={period}
              options={[
                { value: 'daily', label: 'Day' },
                { value: 'weekly', label: 'Week' },
              ]}
              onChange={(option) => set({ period: option })}
            />
            {/* Shows the chosen day, or today in the owner's zone, never an empty "mm/dd/yyyy" (bugs A3, A7). */}
            <DatePicker label="Date" value={date ?? todayInZone()} max={todayInZone()} onChange={(day) => set({ date: day })} />
          </>
        }
      />
      <QueryState query={report}>
        {(data) => (
          <>
            <p className="mb-4 text-sm text-muted">
              {data.period === 'DAY' ? data.start : `${data.start} to ${data.end}`} · {data.timeZone}
            </p>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Sent" value={data.sent} />
              <Stat label="Opened" value={formatPercent(data.openRate)} hint={`${data.openedEmails} of ${data.sent} emails`} />
              <Stat label="Opens" value={data.opens} />
              <Stat label="Clicks" value={data.clicks} />
            </div>
            <Card title={data.period === 'DAY' ? 'Opens and clicks per hour' : 'Opens and clicks per day'}>
              <LazyBucketChart buckets={data.buckets} period={data.period} />
            </Card>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card title="Most opened emails">
                {data.topEmails.length === 0 ? (
                  <Empty title="No opens in this period" />
                ) : (
                  <ol className="divide-y divide-line">
                    {data.topEmails.map((email) => (
                      <li key={email.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="min-w-0">
                          <TextLink to={`/emails/${email.id}`}>{email.subject || '(no subject)'}</TextLink>
                          <span className="block truncate text-xs text-muted">{email.recipients}</span>
                        </span>
                        <span className="whitespace-nowrap tabular-nums">
                          {count(email.opens, 'open')}{email.clicks > 0 && ` · ${count(email.clicks, 'click')}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
              <Card title="Most engaged contacts">
                {data.topContacts.length === 0 ? (
                  <Empty title="No opens in this period" />
                ) : (
                  <ol className="divide-y divide-line">
                    {data.topContacts.map((contact) => (
                      <li key={contact.email} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <TextLink to={`/contacts/${encodeURIComponent(contact.email)}`}>{contact.name || contact.email}</TextLink>
                        <span className="tabular-nums">{count(contact.opens, 'open')}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
