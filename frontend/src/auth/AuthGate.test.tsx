import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { AuthGate } from './AuthGate';
import { getCurrentUser } from '../services/api';

vi.mock('../services/api', () => ({
  getCurrentUser: vi.fn(),
  getGoogleLoginUrl: vi.fn(() => '/api/auth/google/start'),
  logoutCurrentUser: vi.fn()
}));

const authenticatedResponse = {
  authenticated: true,
  auth_configured: true,
  root_admin_email: 'root@example.com',
  access_allowed: true,
  user: {
    id: 1,
    email: 'user@example.com',
    name: 'User',
    avatar_url: null,
    role: 'admin' as const,
    is_root_admin: true
  }
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

test('renders the cached session while auth refresh is pending', async () => {
  window.sessionStorage.setItem('cubixrecipes:auth-session-v1', JSON.stringify(authenticatedResponse));
  let resolveAuth!: (value: typeof authenticatedResponse) => void;
  vi.mocked(getCurrentUser).mockReturnValue(new Promise((resolve) => {
    resolveAuth = resolve;
  }));

  render(
    <AuthGate>
      {(user) => <div>workspace:{user.email}</div>}
    </AuthGate>
  );

  expect(screen.getByText('workspace:user@example.com')).toBeTruthy();
  expect(screen.queryByText('Checking account...')).toBeNull();

  resolveAuth(authenticatedResponse);
  await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
});
