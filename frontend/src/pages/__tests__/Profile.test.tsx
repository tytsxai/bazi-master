import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// Mock dependencies
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com', name: 'Test User' },
    token: 'test-token',
    isAuthenticated: true,
    refreshUser: vi.fn(),
    setProfileName: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../auth/useAuthFetch', () => ({
  useAuthFetch: () => vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  }),
}));

vi.mock('../../utils/aiProvider', () => ({
  getPreferredAiProvider: () => 'openai',
  setPreferredAiProvider: vi.fn(),
}));

vi.mock('../../utils/apiError', () => ({
  readApiErrorMessage: vi.fn().mockResolvedValue('Error message'),
}));

import Profile from '../Profile';

const renderWithRouter = (component: ReactNode) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {component}
    </MemoryRouter>
  );
};

describe('Profile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main content area', () => {
    renderWithRouter(<Profile />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders breadcrumbs navigation', () => {
    renderWithRouter(<Profile />);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });
});
