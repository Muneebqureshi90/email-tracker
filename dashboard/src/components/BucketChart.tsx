import { useId } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

/** Value above a bar; empty for zero so quiet days stay clean. */
function barValue(value: unknown): string {
  return typeof value === 'number' && value > 0 ? String(value) : '';
}

/** Opens and clicks per hour (daily report) or per day (weekly report, every weekday labelled; bug A4). */
export function BucketChart({ buckets, period, height = 256 }: { buckets: Bucket[]; period: 'DAY' | 'WEEK'; height?: number }) {
  const data: Row[] = buckets.map((bucket) => {
    if (period === 'WEEK') return { ...bucket, label: weekdayOf(bucket.label), full: formatDate(bucket.label) };
    const hour = Number(bucket.label.slice(0, 2));
    return { ...bucket, label: bucket.label.slice(0, 2), full: `${bucket.label.slice(0, 2)}:00–${String((hour + 1) % 24).padStart(2, '0')}:00` };
  });
  // SVG ids from useId contain characters url(#…) does not accept.
  const gradient = `mp-bars-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ticks = integerTicks(Math.max(0, ...data.map((row) => Math.max(row.opens, row.clicks))));
  // Without clicks the Clicks bar would still reserve an empty slot and push every Opens bar off centre.
  const hasClicks = data.some((row) => row.clicks > 0);
  return (
    <figure className="p-3 sm:p-4">
      <div style={{ height }} aria-hidden="true" data-testid="bucket-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -20 }} barGap={4} barCategoryGap="22%">
            <defs>
              <linearGradient id={`${gradient}-opens`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--mp-accent)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--mp-accent)" stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id={`${gradient}-clicks`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--mp-chart-2)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--mp-chart-2)" stopOpacity={0.45} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--mp-line)" strokeDasharray="3 4" vertical={false} />
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
              cursor={{ fill: 'var(--mp-raised)', radius: 8 }}
              content={<ChartTooltip />}
              position={{ y: 0 }}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ outline: 'none', zIndex: 20 }}
              isAnimationActive={false}
            />
            <Bar dataKey="opens" name="Opens" fill={`url(#${gradient}-opens)`} radius={[6, 6, 2, 2]} maxBarSize={36} isAnimationActive={false}>
              <LabelList dataKey="opens" position="top" formatter={barValue} fill="var(--mp-fg)" fontSize={11} fontWeight={600} />
            </Bar>
            {hasClicks && (
              <Bar dataKey="clicks" name="Clicks" fill={`url(#${gradient}-clicks)`} radius={[6, 6, 2, 2]} maxBarSize={36} isAnimationActive={false}>
                <LabelList dataKey="clicks" position="top" formatter={barValue} fill="var(--mp-fg)" fontSize={11} fontWeight={600} />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* The legend lives outside the chart so it always lists both series and wraps on small screens. */}
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          Opens
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-(--mp-chart-2)" />
          Clicks{hasClicks ? '' : ' (none yet)'}
        </span>
      </p>
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
