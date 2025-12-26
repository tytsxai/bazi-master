import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute.jsx';

// Mock the auth context
const mockAuth = {
  isAuthenticated: false,
  user: null,
  refreshUser: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../../auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

function TestChild() {
  return <div data-testid="protected-content">Protected Content</div>;
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    mockAuth.refreshUser.mockReset();
    mockAuth.logout.mockReset();
  });

  it('redirects to login when not authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(window.location.pathname).toBe('/login');
  });

  it('includes next parameter in redirect URL', () => {
    render(
      <MemoryRouter initialEntries={['/protected?param=value']}>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('?next=%2Fprotected%3Fparam%3Dvalue');
  });

  it('includes session_expired reason when session expired', () => {
    localStorageMock.getItem.mockReturnValue('1');

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain('reason=session_expired');
  });

  it('shows loading state when authenticated but no user', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = null;
    mockAuth.refreshUser.mockResolvedValue(null);

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('common.loadingAccount')).toBeInTheDocument();
  });

  it('shows error state when user verification fails', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = null;
    mockAuth.refreshUser.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('common.loadAccountError')).toBeInTheDocument();
    });

    expect(screen.getByText('common.retry')).toBeInTheDocument();
    expect(screen.getByText('common.signInAgain')).toBeInTheDocument();
  });

  it('renders children when authenticated and user exists', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = { id: 1, email: 'test@example.com' };

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('calls refreshUser when authenticated but no user', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = null;
    mockAuth.refreshUser.mockResolvedValue({ id: 1, email: 'test@example.com' });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(mockAuth.refreshUser).toHaveBeenCalled();
  });

  it('calls logout when sign in again button is clicked', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = null;
    mockAuth.refreshUser.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('common.signInAgain')).toBeInTheDocument();
    });

    const signInAgainButton = screen.getByText('common.signInAgain');
    signInAgainButton.click();

    expect(mockAuth.logout).toHaveBeenCalled();
  });

  it('retries verification when retry button is clicked', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = null;
    mockAuth.refreshUser.mockRejectedValueOnce(new Error('Network error'));
    mockAuth.refreshUser.mockResolvedValueOnce({ id: 1, email: 'test@example.com' });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('common.retry')).toBeInTheDocument();
    });

    const retryButton = screen.getByText('common.retry');
    retryButton.click();

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });
});

