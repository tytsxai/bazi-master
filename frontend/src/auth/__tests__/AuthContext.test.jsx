import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext.jsx';

// Store for mock localStorage
let store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, value) => { store[key] = value; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { store = {}; }),
};

const sessionStorageMock = {
  clear: vi.fn(),
};

// Setup mocks before module loads
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('sessionStorage', sessionStorageMock);
vi.stubGlobal('fetch', vi.fn());

// Test component to consume auth context
function TestComponent() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="isAuthenticated">{auth.isAuthenticated ? 'true' : 'false'}</div>
      <div data-testid="token">{auth.token || 'null'}</div>
      <div data-testid="user">{auth.user ? JSON.stringify(auth.user) : 'null'}</div>
      <div data-testid="profileName">{auth.profileName || ''}</div>
      <button onClick={() => auth.setProfileName('test')}>Set Profile Name</button>
      <button onClick={auth.logout}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
    global.fetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('provides default auth state when no token', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('token')).toHaveTextContent('null');
  });

  it('loads token from localStorage on mount', () => {
    store['bazi_token'] = 'token_123_456_abc';

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('token')).toHaveTextContent('token_123_456_abc');
  });

  it('loads user from localStorage on mount', () => {
    const mockUser = { id: 1, email: 'test@example.com' };
    store['bazi_user'] = JSON.stringify(mockUser);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
  });

  it('loads profile name from localStorage on mount', () => {
    // Need token for profile name to persist (AuthContext clears it without token)
    store['bazi_token'] = 'token_123_456_abc';
    store['bazi_profile_name'] = 'Test User';

    // Mock fetch to return 401 (no API override of profile name)
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('profileName')).toHaveTextContent('Test User');
  });

  it('throws error when useAuth is used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow(
      'useAuth must be used within AuthProvider'
    );

    consoleSpy.mockRestore();
  });

  it('calls logout and clears storage', async () => {
    store['bazi_token'] = 'token_123_456_abc';

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const logoutButton = screen.getByText('Logout');

    await act(async () => {
      logoutButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    });
  });

  it('handles invalid JSON in localStorage user gracefully', () => {
    store['bazi_user'] = 'invalid json';

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent('null');
  });
});
