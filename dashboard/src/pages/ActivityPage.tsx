import { Activity } from 'lucide-react';
import { useActivityFeed } from '../api/queries';
import { ActivityList } from '../components/ActivityList';
import { Segmented } from '../components/controls';
import { Button, Card, Empty, ErrorBox, LoadingBlock, PageHeader } from '../components/ui';
import { dayHeading, groupByDay } from '../lib/format';
import { ACTIVITY_FILTERS } from '../lib/labels';
import { useNow } from '../lib/now';
import { useListParams } from '../lib/paging';

const EMPTY: Record<string, string> = {
  all: 'Opens, clicks, alerts and document views show up here within a minute of happening.',
  opens: 'No counted opens yet.',
  clicks: 'No counted clicks yet.',
  alerts: 'No alerts yet.',
  documents: 'No document views, reads or downloads yet. Share a document from the Documents page.',
};

/** Grouped by Today / Yesterday / date (in the settings zone), filter chips, and "Load older" paging. */
export function ActivityPage() {
  const now = useNow();
  const list = useListParams();
  const filter = ACTIVITY_FILTERS.find((option) => option.value === list.get('show')) ?? ACTIVITY_FILTERS[0];
  const feed = useActivityFeed([...filter.kinds]);
  const seen = new Set<number>();
  const items = (feed.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)))
    .sort((a, b) => b.id - a.id);
  const groups = groupByDay(items, (item) => item.occurredAt);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Counted opens, clicks, alerts and document views, newest first. This list updates by itself."
        actions={
          <Segmented
            label="Show"
            value={filter.value}
            options={ACTIVITY_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => list.update({ show: value === 'all' ? null : value })}
          />
        }
      />
      <Card>
        {feed.isPending ? (
          <LoadingBlock lines={6} />
        ) : !feed.data ? (
          <div className="p-4">
            <ErrorBox error={feed.error} onRetry={() => void feed.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <Empty title="Nothing yet" icon={Activity}>
            {EMPTY[filter.value]}
          </Empty>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.day} aria-labelledby={`day-${group.day}`}>
                <h2
                  id={`day-${group.day}`}
                  className="sticky top-0 z-[2] border-b border-line bg-surface px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase first:rounded-t-xl"
                >
                  {dayHeading(group.day, now)}
                </h2>
                <ActivityList items={group.items} now={now} timeOfDay />
              </section>
            ))}
            {feed.hasNextPage && (
              <div className="border-t border-line p-3 text-center">
                <Button loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
                  Load older
                </Button>
              </div>
            )}
            {feed.isFetchNextPageError && (
              <div className="p-4">
                <ErrorBox error={feed.error} onRetry={() => void feed.fetchNextPage()} />
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
