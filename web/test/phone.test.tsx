import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idea, me, mockApi, post, renderApp, space } from './utils';

describe('Phone layout', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 767px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('lists posts as rows with a tab bar, and opens one post with the X | LinkedIn switch', async () => {
    const posted = post({ channel: 'X', status: 'POSTED', postedAt: new Date().toISOString() });
    mockApi({
      'GET /api/me': me,
      'GET /api/spaces': [space],
      'GET /api/ideas/today?space=sp1': [
        idea({ id: 'a1', kind: 'NEWS', title: 'Survey news', linkedinText: 'LinkedIn text', posts: [posted] }),
        idea({ id: 'a2', kind: 'SHIPPED', title: 'Shipped thing', xText: 'X text', linkedinText: 'LinkedIn text' }),
      ],
    });
    renderApp('/');

    const rows = await screen.findByRole('region', { name: 'New' });
    expect(within(rows).getByRole('img', { name: 'X: posted' })).toBeInTheDocument();
    expect(within(rows).getAllByRole('img', { name: 'LinkedIn: not posted yet' })).toHaveLength(2);
    expect(screen.getByRole('navigation', { name: 'Tabs' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();

    fireEvent.click(within(rows).getByText('Shipped thing'));
    const tabs = await screen.findByRole('radiogroup', { name: 'Channel' });
    expect(within(tabs).getByRole('radio', { name: 'X' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Post to X' })).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole('radio', { name: 'LinkedIn' }));
    expect(screen.getByRole('button', { name: 'Post to LinkedIn' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Tabs' })).not.toBeInTheDocument();
  });
});
