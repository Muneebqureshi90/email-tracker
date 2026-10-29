import { lazy, Suspense } from 'react';
import type { Bucket } from '../api/types';
import { Spinner } from './ui';

// Recharts is the largest dependency, so charts load in their own chunk.
const Chart = lazy(() => import('./BucketChart').then((module) => ({ default: module.BucketChart })));

export function LazyBucketChart(props: { buckets: Bucket[]; period: 'DAY' | 'WEEK' }) {
  return (
    <Suspense fallback={<Spinner label="Loading chart…" />}>
      <Chart {...props} />
    </Suspense>
  );
}