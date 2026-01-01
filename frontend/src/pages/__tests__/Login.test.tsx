import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    token: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    setSession: vi.fn(),
  }),
}));

vi.mock('../../utils/apiError', () => ({
  readApiErrorMessage: vi.fn().mockResolvedValue('Error message'),
}));

vi.mock('../../utils/validation', () => ({
  emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  validateLogin: vi.fn().mockReturnValue({}),
  validatePasswordStrength: vi.fn().mockReturnValue(null),
  validateEmail: vi.fn().mockReturnValue(null),
}));

import Login from '../Login';

const renderWithRouter = (component, initialEntries = ['/login']) => {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {component}
    </MemoryRouter>
  );
};

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the main content area', () => {
    renderWithRouter(<Login />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders breadcrumbs navigation', () => {
    renderWithRouter(<Login />);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it('renders login form by default', () => {
    renderWithRouter(<Login />);
    expect(screen.getByText('auth.login')).toBeInTheDocument();
  });

  it('renders email input field', () => {
    renderWithRouter(<Login />);
    const emailInput = screen.getByLabelText(/auth\.email/i);
    expect(emailInput).toBeInTheDocument();
  });

  it('renders password input field', () => {
    renderWithRouter(<Login />);
    const passwordInput = screen.getByLabelText(/auth\.password/i);
    expect(passwordInput).toBeInTheDocument();
  });
});
