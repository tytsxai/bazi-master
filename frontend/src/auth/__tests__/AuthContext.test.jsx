import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

// Test component to consume context
const TestComponent = () => {
  const { isAuthenticated, user, login, logout, profileName } = useAuth();
  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'Authenticated' : 'Guest'}</div>
      <div data-testid="user-email">{user?.email}</div>
      <div data-testid="profile-name">{profileName}</div>
      <button onClick={() => login('test@example.com', 'password')}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
};

// Simplified Test Component that exposes methods via window for testing to avoid fireEvent complexities with context
const TestConsumer = () => {
  const auth = useAuth();
  window.authTest = auth;
  return null;
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: () => Promise.resolve({}),
    });
  });

  it('provides initial unauthenticated state', () => {
    render(
      <AuthProvider>
        <TestConsumer />
        <TestComponent />
      </AuthProvider>
    );
    expect(screen.getByTestId('auth-status')).toHaveTextContent('Guest');
  });

  it('initializes from localStorage', () => {
    localStorage.setItem('bazi_token', 'mock-token');
    localStorage.setItem('bazi_user', JSON.stringify({ email: 'stored@example.com' }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('stored@example.com');
  });

  it('login updates state on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'new-token',
        user: { email: 'new@example.com' }
      })
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      await window.authTest.login('new@example.com', 'password');
    });

    expect(window.authTest.isAuthenticated).toBe(true);
    expect(window.authTest.user.email).toBe('new@example.com');
    expect(localStorage.getItem('bazi_token')).toBe('new-token');
  });

  it('logout clears state and storage', async () => {
    localStorage.setItem('bazi_token', 'mock-token');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: () => Promise.resolve({})
    }); // Logout API call

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(window.authTest.isAuthenticated).toBe(true);

    await act(async () => {
      window.authTest.logout();
    });

    expect(window.authTest.isAuthenticated).toBe(false);
    expect(window.authTest.user).toBeNull();
    expect(localStorage.getItem('bazi_token')).toBeNull();
  });
});
