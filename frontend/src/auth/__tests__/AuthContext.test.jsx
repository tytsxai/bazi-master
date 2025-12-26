import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext.jsx';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
  clear: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock fetch
global.fetch = vi.fn();

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
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockImplementation(() => {});
    localStorageMock.removeItem.mockImplementation(() => {});
    localStorageMock.clear.mockImplementation(() => {});
    sessionStorageMock.clear.mockImplementation(() => {});
    global.fetch.mockReset();
  });

  it('provides default auth state when no token', () => {
    localStorageMock.getItem.mockReturnValue(null);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('token')).toHaveTextContent('null');
    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('profileName')).toHaveTextContent('');
  });

  it('loads token from localStorage on mount', () => {
    const mockToken = 'token_123_456_abc';
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'bazi_token') return mockToken;
      return null;
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('token')).toHaveTextContent(mockToken);
  });

  it('loads user from localStorage on mount', () => {
    const mockUser = { id: 1, email: 'test@example.com' };
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'bazi_user') return JSON.stringify(mockUser);
      return null;
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
  });

  it('loads profile name from localStorage on mount', () => {
    const mockProfileName = 'Test User';
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'bazi_profile_name') return mockProfileName;
      return null;
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('profileName')).toHaveTextContent(mockProfileName);
  });

  it('throws error when useAuth is used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow(
      'useAuth must be used within AuthProvider'
    );

    consoleSpy.mockRestore();
  });

  it('calls logout and clears storage', async () => {
    const mockToken = 'token_123_456_abc';
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'bazi_token') return mockToken;
      return null;
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const logoutButton = screen.getByText('Logout');
    logoutButton.click();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${mockToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: mockToken }),
      });
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bazi_token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bazi_token_origin');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bazi_user');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bazi_last_activity');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bazi_session_expired');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bazi_profile_name');
    expect(sessionStorageMock.clear).toHaveBeenCalled();
  });

  it('handles invalid JSON in localStorage user gracefully', () => {
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'bazi_user') return 'invalid json';
      return null;
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bazi_user');
  });
});


