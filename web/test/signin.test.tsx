import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { me, mockApi, renderApp, signedOut } from './utils';

describe('Sign in', () => {
  it('shows "This app is private." for ?error=private', async () => {
    mockApi({ 'GET /api/me': signedOut });
    renderApp('/sign-in?error=private');
    expect(await screen.findByRole('alert')).toHaveTextContent('This app is private.');
    expect(screen.getByRole('link', { name: /Continue with Google/ })).toHaveAttribute('href', '/api/auth/google');
  });

  it('shows the sign-in page in place when the session has ended', async () => {
    mockApi({ 'GET /api/me': signedOut });
    renderApp('/posted');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the app when signed in', async () => {
    mockApi({ 'GET /api/me': me, 'GET /api/ideas/today': [], 'GET /api/profile': {} });
    renderApp('/sign-in');
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });
});
