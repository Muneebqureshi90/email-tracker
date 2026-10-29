import { useActivity } from '../api/queries';
import { ActivityList } from '../components/ActivityList';
import { Card, Empty, PageHeader, QueryState } from '../components/ui';
import { useNow } from '../lib/now';

export function ActivityPage() {
  const now = useNow();
  const activity = useActivity(100);
  return (
    <>
      <PageHeader title="Activity" description="Counted opens and clicks, newest first. This list updates by itself." />
      <Card>
        <QueryState query={activity}>
          {(page) =>
            page.items.length === 0 ? (
              <Empty title="Nothing yet">Opens and clicks show up here about a minute after they happen.</Empty>
            ) : (
              <ActivityList items={page.items} now={now} />
            )
          }
        </QueryState>
      </Card>
    </>
  );
}
