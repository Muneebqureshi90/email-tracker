import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Bucket } from '../api/types';
import { count, formatDate, weekdayOf } from '../lib/format';

interface Row {
  label: string;
  full: string;
  opens: number;
  clicks: number;
}

/** Whole-number ticks that end at the data (a peak of 1 gives 0 and 1, not 0 to 4; bug A3). */
export function integerTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max));
  const step = Math.max(1, Math.ceil(top / 4));
  const ticks: number[] = [];
  for (let tick = 0; tick < top + step; tick += step) ticks.push(tick);
  return ticks;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg shadow-(--shadow-md)">
      <p className="font-semibold">{row.full}</p>
      <p className="mt-1 flex items-center gap-1.5 tabular-nums">
        <span className="h-2 w-2 rounded-sm bg-accent" aria-hidden="true" />
        {count(row.opens, 'open')}
      </p>
      <p className="flex items-center gap-1.5 tabular-nums">
        <span className="h-2 w-2 rounded-sm bg-(--mp-chart-2)" aria-hidden="true" />
        {count(row.clicks, 'click')}
      </p>
    </div>
  );
}

/** Opens and clicks per hour (daily report) or per day (weekly report, every weekday labelled; bug A4). */
export function BucketChart({ buckets, period, height = 256 }: { buckets: Bucket[]; period: 'DAY' | 'WEEK'; height?: number }) {
  const data: Row[] = buckets.map((bucket) => {
    if (period === 'WEEK') return { ...bucket, label: weekdayOf(bucket.label), full: formatDate(bucket.label) };
    const hour = Number(bucket.label.slice(0, 2));
    return { ...bucket, label: bucket.label.slice(0, 2), full: `${bucket.label.slice(0, 2)}:00–${String((hour + 1) % 24).padStart(2, '0')}:00` };
  });
  const ticks = integerTicks(Math.max(0, ...data.map((row) => Math.max(row.opens, row.clicks))));
  return (
    <figure className="p-4">
      <div style={{ height }} aria-hidden="true" data-testid="bucket-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barGap={2}>
            <CartesianGrid stroke="var(--mp-line)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--mp-muted)" fontSize={12} tickLine={false} axisLine={false} interval={period === 'WEEK' ? 0 : 'preserveStartEnd'} />
            <YAxis
              allowDecimals={false}
              domain={[0, ticks.at(-1) ?? 1]}
              ticks={ticks}
              stroke="var(--mp-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'var(--mp-raised)' }}
              content={<ChartTooltip />}
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ outline: 'none', zIndex: 20 }}
              isAnimationActive={false}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Bar dataKey="opens" name="Opens" fill="var(--mp-accent)" radius={[6, 6, 2, 2]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="clicks" name="Clicks" fill="var(--mp-chart-2)" radius={[6, 6, 2, 2]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* A table cannot be shrunk by sr-only itself (it would still make the page scroll), so it sits in a div. */}
      <div className="sr-only">
        <table>
          <caption>{period === 'DAY' ? 'Opens and clicks per hour' : 'Opens and clicks per day'}</caption>
          <tbody>
            {data.map((bucket) => (
              <tr key={bucket.full}>
                <th scope="row">{bucket.full}</th>
                <td>{count(bucket.opens, 'open')}</td>
                <td>{count(bucket.clicks, 'click')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
