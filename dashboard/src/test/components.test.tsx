import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberStepper, RadioGroup, Segmented, Select, Tabs } from '../components/controls';
import { DataTable, type Column } from '../components/DataTable';
import { DatePicker } from '../components/DatePicker';
import { ConfirmDialog } from '../components/dialogs';
import { initialsOf, markOf } from '../components/marks';
import { clearToasts, toast, Toaster } from '../components/toast';
import { Badge, Button } from '../components/ui';
import { clampPage, paginate } from '../lib/paging';
import { email } from './helpers';

afterEach(() => clearToasts());

function Controlled<T extends string | number>({ initial, render: draw }: { initial: T; render: (value: T, set: (value: T) => void) => ReactNode }) {
  const [value, setValue] = useState<T>(initial);
  return <>{draw(value, setValue)}</>;
}

describe('Select (bug A7)', () => {
  const options = [
    { value: 'TRUNCATED', label: 'Store shortened' },
    { value: 'OFF', label: 'Do not store' },
  ];

  it('opens a themed listbox and picks with the mouse', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<Select label="Reader network addresses" value="TRUNCATED" options={options} onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Reader network addresses' });
    expect(trigger.textContent).toContain('Store shortened');
    await userEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(screen.getByRole('option', { name: 'Do not store' }));
    expect(onChange).toHaveBeenCalledWith('OFF');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('works with the keyboard like a native select', async () => {
    render(<Controlled<string> initial="TRUNCATED" render={(value, set) => <Select label="Mode" value={value} options={options} onChange={set} />} />);
    const trigger = screen.getByRole('combobox', { name: 'Mode' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const list = screen.getByRole('listbox');
    expect(list.getAttribute('aria-activedescendant')).toMatch(/-0$/);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(trigger.textContent).toContain('Do not store');
    await userEvent.click(trigger);
    await userEvent.keyboard('s{Enter}');
    expect(trigger.textContent).toContain('Store shortened');
  });
});

describe('NumberStepper (bug A7)', () => {
  it('steps with the buttons and arrow keys and stays in range', async () => {
    render(<Controlled<number> initial={9} render={(value, set) => <NumberStepper label="Hold" value={value} min={5} max={10} onChange={set} />} />);
    const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Hold' });
    await userEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(input.value).toBe('10');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Increase' }).disabled).toBe(true);
    input.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(input.value).toBe('8');
    await userEvent.clear(input);
    await userEvent.type(input, '7');
    expect(input.value).toBe('7');
    expect(input.getAttribute('aria-valuenow')).toBe('7');
  });
});

describe('DatePicker (bugs A3 and A7)', () => {
  it('shows the chosen day, picks another from the calendar and clears', async () => {
    const onChange = vi.fn<(day: string) => void>();
    render(<DatePicker label="Date" value="2026-10-14" onChange={onChange} clearLabel="No date" />);
    const trigger = screen.getByRole('button', { name: /^Date:/ });
    expect(trigger.getAttribute('data-value')).toBe('2026-10-14');
    expect(trigger.textContent).toMatch(/14/);
    await userEvent.click(trigger);
    const calendar = await screen.findByRole('dialog', { name: 'Date' });
    await userEvent.click(within(calendar).getByRole('button', { name: /October 20th, 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-20');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('button', { name: 'No date' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

describe('segmented control, radio group and tabs', () => {
  it('marks the chosen segment and shows counts', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<Segmented label="Show" value="" options={[{ value: '', label: 'All', count: 140 }, { value: 'opened', label: 'Opened', count: 12 }]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'All 140' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Opened 12' }));
    expect(onChange).toHaveBeenCalledWith('opened');
  });

  it('moves the radio selection with the arrow keys', async () => {
    const options = [
      { value: 'FIRST', label: 'First open only' },
      { value: 'EVERY', label: 'Every open' },
      { value: 'EVERY_AFTER_GAP', label: 'Every open after a 1-hour gap' },
    ];
    render(<Controlled<string> initial="EVERY" render={(value, set) => <RadioGroup label="Notify me on" value={value} options={options} onChange={set} />} />);
    const group = screen.getByRole('radiogroup', { name: 'Notify me on' });
    const every = within(group).getByRole('radio', { name: 'Every open' });
    expect(every.getAttribute('aria-checked')).toBe('true');
    expect(every.tabIndex).toBe(0);
    every.focus();
    await userEvent.keyboard('{ArrowDown}');
    const gap = within(group).getByRole('radio', { name: 'Every open after a 1-hour gap' });
    expect(gap.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(gap);
    await userEvent.keyboard('{ArrowDown}');
    expect(within(group).getByRole('radio', { name: 'First open only' }).getAttribute('aria-checked')).toBe('true');
  });

  it('switches tabs with the arrow keys', async () => {
    render(
      <Controlled<string>
        initial="links"
        render={(value, set) => (
          <Tabs label="Document" value={value} onChange={set} tabs={[{ value: 'links', label: 'Links' }, { value: 'events', label: 'Events', count: 3 }]}>
            <p>{value} panel</p>
          </Tabs>
        )}
      />,
    );
    screen.getByRole('tab', { name: 'Links' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Events 3' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('events panel');
  });
});

describe('DataTable', () => {
  type Row = { id: string; name: string; opens: number };
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', cell: (row) => <a href={`/rows/${row.id}`}>{row.name}</a> },
    { key: 'opens', header: 'Opens', cell: (row) => row.opens, sort: 'opens', align: 'right' },
  ];

  function renderTable(props: Partial<Parameters<typeof DataTable<Row>>[0]>) {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <DataTable<Row> label="Rows" columns={columns} rows={undefined} rowKey={(row) => row.id} empty={<p>Nothing here</p>} {...props} />,
        },
        { path: '/rows/:id', element: <p>Row page</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  it('shows skeleton rows while loading and the empty state when there is nothing', () => {
    renderTable({});
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(6);
    expect(screen.getByRole('table', { name: 'Rows' }).getAttribute('aria-busy')).toBe('true');
  });

  it('shows the empty state and the error state with retry', async () => {
    renderTable({ rows: [] });
    expect(screen.getByText('Nothing here')).toBeTruthy();
    const onRetry = vi.fn();
    renderTable({ rows: undefined, error: new Error('x'), onRetry });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('sorts by a header and opens a row when it is clicked', async () => {
    const onSort = vi.fn<(key: string) => void>();
    const router = renderTable({ rows: [{ id: 'r1', name: 'First', opens: 3 }], sort: 'opens', dir: 'asc', onSort, rowTo: (row) => `/rows/${row.id}` });
    const header = screen.getByRole('columnheader', { name: /Opens/ });
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(within(header).getByRole('button'));
    expect(onSort).toHaveBeenCalledWith('opens');
    await userEvent.click(screen.getByRole('cell', { name: '3' }));
    expect(router.state.location.pathname).toBe('/rows/r1');
  });
});

describe('marks (contract display rule)', () => {
  it('follows the same rule as the extension', () => {
    expect(markOf(email({ openCount: 0, clickCount: 0 })).state).toBe('sent');
    expect(markOf(email({ openCount: 1 }))).toMatchObject({ state: 'opened', label: 'Opened', count: 1 });
    expect(markOf(email({ openCount: 3 }))).toMatchObject({ state: 'opened', label: 'Opened 3 times', count: 3 });
    expect(markOf(email({ openCount: 2, clickCount: 1 })).state).toBe('clicked');
    expect(markOf(email({ openCount: 0, openStatusUnreliable: true })).state).toBe('unreliable');
    expect(markOf(email({ status: 'DRAFT' })).state).toBe('none');
    expect(markOf(email(), false).state).toBe('none');
  });

  it('builds initials from names and addresses', () => {
    expect(initialsOf('Jane Doe', 'jane@example.com')).toBe('JD');
    expect(initialsOf(null, 'jane.doe@example.com')).toBe('JA');
    expect(initialsOf('  ', '@example.com')).toBe('?');
  });
});

describe('toasts, dialogs and buttons', () => {
  it('shows a toast with an action and dismisses it', async () => {
    const onUndo = vi.fn();
    const router = createMemoryRouter([{ path: '/', element: <Toaster /> }]);
    render(<RouterProvider router={router} />);
    act(() => {
      toast({ title: 'Marked as your own view', description: 'The open no longer counts.', tone: 'success', action: { label: 'Undo', onClick: onUndo } });
    });
    expect(screen.getByText('Marked as your own view')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
    expect(screen.queryByText('Marked as your own view')).toBeNull();
  });

  it('closes a toast by itself after a while', () => {
    vi.useFakeTimers();
    const router = createMemoryRouter([{ path: '/', element: <Toaster /> }]);
    render(<RouterProvider router={router} />);
    act(() => {
      toast({ title: 'Saved' });
    });
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('Saved')).toBeNull();
    vi.useRealTimers();
  });

  it('asks before a dangerous action', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onOpenChange={() => undefined} title="Revoke the token?" description="The extension stops working." confirmLabel="Revoke" onConfirm={onConfirm} />);
    const dialog = screen.getByRole('dialog', { name: 'Revoke the token?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('blocks a loading button and labels badges', () => {
    render(
      <>
        <Button loading>Save</Button>
        <Badge tone="good">Counted</Badge>
      </>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Counted').className).toContain('text-good');
  });
});

describe('client-side paging', () => {
  it('clamps the page when a list shrinks', () => {
    expect(clampPage(3, 25, 60)).toBe(2);
    expect(clampPage(0, 25, 0)).toBe(0);
    expect(paginate([1, 2, 3], 1, 2)).toEqual([3]);
  });
});
