import { useSearchParams } from 'react-router';
import { useBestTime, useThisWeek, type BestTimeCell } from '../api/bestTime';
import { useLastWeek } from '../api/lastWeek';
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

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MIN_OPENS_FOR_ADVICE = 10;

/** The two neighbouring hours of one weekday with the most opens, as "Tuesday 9–11". */
export function bestWindow(cells: BestTimeCell[]): string {
  const opens = new Map(cells.map((cell) => [(cell.weekday - 1) * 24 + cell.hour, cell.opens]));
  let best = { day: 0, hour: 0, opens: -1 };
  WEEKDAYS.forEach((_, day) => {
    for (let hour = 0; hour < 23; hour++) {
      const sum = (opens.get(day * 24 + hour) ?? 0) + (opens.get(day * 24 + hour + 1) ?? 0);
      if (sum > best.opens) best = { day, hour, opens: sum };
    }
  });
  return `${WEEKDAYS[best.day]} ${best.hour}–${best.hour + 2}`;
}

function ThisWeekRow() {
  const week = useThisWeek();
  return (
    <section aria-label="This week" className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">This week</h2>
      <QueryState query={week}>
        {(data) => (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sent" value={data.sent} />
            <Stat label="Opened" value={data.opened} hint="emails with an open" />
            <Stat label="Clicked" value={data.clicked} hint="emails with a click" />
            <Stat label="Document views" value={data.documentViews} />
          </div>
        )}
      </QueryState>
    </section>
  );
}

function LastWeekRow() {
  const week = useLastWeek();
  return (
    <section aria-label="Last week" className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">Last week</h2>
      <QueryState query={week}>
        {(data) => (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Sent" value={data.sent} />
            <Stat label="Opened" value={data.opened} hint="emails with an open" />
            <Stat label="Replied" value={data.replied} />
            <Stat label="Interviews" value={data.interviews} />
            <Stat label="CV views" value={data.documentViews} />
          </div>
        )}
      </QueryState>
    </section>
  );
}

function BestTimeCard() {
  const bestTime = useBestTime();
  return (
    <Card title="Best time to send">
      <QueryState query={bestTime}>
        {(data) => {
          if (data.totalOpens < MIN_OPENS_FOR_ADVICE) {
            return <Empty title={`Not enough opens yet (${data.totalOpens} of ${MIN_OPENS_FOR_ADVICE} needed in the last 180 days)`} />;
          }
          const opens = new Map(data.cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.opens]));
          const max = Math.max(1, ...data.cells.map((cell) => cell.opens));
          return (
            <div className="px-4 py-3">
              <p className="mb-3 text-sm">Recruiters open your emails most on {bestWindow(data.cells)}.</p>
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-0.5 text-xs">
                  <thead>
                    <tr>
                      <th scope="col" className="sr-only">Day</th>
                      {HOURS.map((hour) => (
                        <th key={hour} scope="col" className="w-4 font-normal text-muted">{hour % 6 === 0 ? hour : ''}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAYS.map((day, index) => (
                      <tr key={day}>
                        <th scope="row" className="pr-2 text-left font-normal text-muted">{day.slice(0, 3)}</th>
                        {HOURS.map((hour) => {
                          const value = opens.get(`${index + 1}-${hour}`) ?? 0;
                          return (
                            <td
                              key={hour}
                              aria-label={`${day} ${String(hour).padStart(2, '0')}:00: ${count(value, 'open')}`}
                              title={`${day} ${String(hour).padStart(2, '0')}:00: ${count(value, 'open')}`}
                              className="h-4 w-4 rounded-sm border border-line"
                              style={value > 0 ? { backgroundColor: `rgb(37 99 235 / ${(0.2 + (0.8 * value) / max).toFixed(2)})` } : undefined}
                            />
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span>Fewer</span>
                {[0.2, 0.4, 0.6, 0.8, 1].map((alpha) => (
                  <span key={alpha} aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: `rgb(37 99 235 / ${alpha})` }} />
                ))}
                <span>More opens</span>
                <span>· {data.totalOpens} opens in the last 180 days · {data.timezone}</span>
              </p>
            </div>
          );
        }}
      </QueryState>
    </Card>
  );
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
      <ThisWeekRow />
      <LastWeekRow />
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
      <div className="mt-6">
        <BestTimeCard />
      </div>
    </>
  );
}
