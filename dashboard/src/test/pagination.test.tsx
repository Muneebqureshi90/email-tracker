import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination, paginate } from '../components/ui';
import { email, mockApi, renderAt } from './helpers';

describe('pagination', () => {
  it('shows the range and moves to the first, previous, next and last page', async () => {
    const onPage = vi.fn<(page: number) => void>();
    const onSize = vi.fn<(size: number) => void>();
    render(<Pagination page={1} size={25} total={140} onPage={onPage} onSize={onSize} />);
    expect(screen.getByText('26–50 of 140')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'First page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Last page' }));
    expect(onPage.mock.calls.map(([target]) => target)).toEqual([0, 0, 2, 5]);
    // The page size is a themed listbox, not a native select (bug A7).
    await userEvent.click(screen.getByRole('combobox', { name: 'Per page' }));
    await userEvent.click(screen.getByRole('option', { name: '50' }));
    expect(onSize).toHaveBeenCalledWith(50);
  });

  it('disables the ends and hides itself for one short page', () => {
    const { rerender } = render(<Pagination page={0} size={25} total={30} onPage={() => undefined} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous page' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next page' }).disabled).toBe(false);
    rerender(<Pagination page={0} size={25} total={10} onPage={() => undefined} />);
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  it('pages a whole list on the client', () => {
    const items = Array.from({ length: 60 }, (_, index) => index);
    expect(paginate(items, 0, 25)).toHaveLength(25);
    expect(paginate(items, 2, 25)).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
  });

  it('keeps the page in the URL', async () => {
    const calls = mockApi({
      'GET /api/emails': (call) => ({ body: { items: [email()], page: Number(call.search.get('page') ?? 0), size: 25, total: 60 } }),
      'GET /api/accounts': { body: ['me@gmail.com'] },
    });
    const router = renderAt('/emails');
    // A compact pager sits in the fixed top bar, the full one below the list.
    const bottom = await screen.findByRole('navigation', { name: 'Pages' });
    expect(screen.getByRole('navigation', { name: 'Pages (top)' })).toBeTruthy();
    await userEvent.click(within(bottom).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(router.state.location.search).toBe('?page=1'));
    await waitFor(() => expect(calls.filter((call) => call.path === '/api/emails').at(-1)?.search.get('page')).toBe('1'));
    expect((await screen.findAllByText('26–50 of 60')).length).toBe(2);
  });
});

vi.setConfig({ testTimeout: 60_000 });
