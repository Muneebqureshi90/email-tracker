import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Bucket } from '../api/types';
import { count, formatDate } from '../lib/format';

/** Opens and clicks per hour (daily report) or per day (weekly report). */
export function BucketChart({ buckets, period }: { buckets: Bucket[]; period: 'DAY' | 'WEEK' }) {
  const data = buckets.map((bucket) => ({ ...bucket, label: period === 'WEEK' ? formatDate(bucket.label) : bucket.label.slice(0, 2) }));
  return (
    <figure className="p-4">
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--mp-line)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--mp-muted)" fontSize={12} tickLine={false} />
            <YAxis allowDecimals={false} stroke="var(--mp-muted)" fontSize={12} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'var(--mp-raised)' }}
              contentStyle={{ background: 'var(--mp-surface)', border: '1px solid var(--mp-line)', borderRadius: 8, color: 'var(--mp-fg)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="opens" name="Opens" fill="var(--mp-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="clicks" name="Clicks" fill="var(--mp-chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* A table cannot be shrunk by sr-only itself (it would still make the page scroll), so it sits in a div. */}
      <div className="sr-only">
        <table>
          <caption>{period === 'DAY' ? 'Opens and clicks per hour' : 'Opens and clicks per day'}</caption>
          <tbody>
            {data.map((bucket) => (
              <tr key={bucket.label}>
                <th scope="row">{bucket.label}</th>
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
