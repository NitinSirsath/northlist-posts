import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { base, me, mockApi, renderApp, space } from './utils';

const newUser = { ...me, onboarded: false, onboardingStep: 0 };

describe('first-run steps', () => {
  it('a new user goes to the first-run steps, and the goal makes the first space', async () => {
    const calls = mockApi({
      'GET /api/me': newUser,
      'GET /api/spaces': [],
      'PUT /api/onboarding': (body: unknown) => ({ onboardingStep: (body as { step: number }).step, onboarded: false }),
      'POST /api/spaces': { ...space, name: 'My product', interests: [], links: [] },
    });
    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }));
    expect(await screen.findByText('What do you want from posting?')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Promote a product/ }));
    fireEvent.click(next);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === '/api/spaces')?.body).toEqual({ goal: 'PROMOTE' }),
    );
    expect(await screen.findByText('Where does your work live?')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/api/onboarding').map((c) => c.body)).toContainEqual({ step: 3 });
  });

  it('resumes where you left off, and Antigravity is picked first', async () => {
    mockApi({ 'GET /api/me': { ...newUser, onboardingStep: 8 }, 'GET /api/spaces': [space], 'GET /api/tokens': [] });
    renderApp('/welcome');
    expect(await screen.findByText('Connect your AI')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Antigravity/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download ZIP/ })).toHaveAttribute(
      'href',
      'https://github.com/example/kit/archive/refs/heads/main.zip',
    );
  });

  it('someone already set up never sees the steps', async () => {
    mockApi({ ...base, 'GET /api/ideas/today?space=sp1': [] });
    renderApp('/welcome');
    expect(await screen.findByText('No drafts yet today')).toBeInTheDocument();
  });
});
