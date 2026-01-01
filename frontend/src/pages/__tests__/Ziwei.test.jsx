import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = {
  isAuthenticated: false,
  isAuthResolved: true,
  login: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../auth/useAuthFetch', () => ({
  useAuthFetch: () =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }),
}));

vi.mock('../../utils/aiProvider', () => ({
  getPreferredAiProvider: () => 'openai',
}));

vi.mock('../../utils/apiError', () => ({
  readApiErrorMessage: vi.fn().mockResolvedValue('Error message'),
}));

// Mock fetch
global.fetch = vi.fn();

import Ziwei from '../Ziwei';

const renderWithRouter = (component) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {component}
    </MemoryRouter>
  );
};

describe('Ziwei', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    authState.isAuthResolved = true;
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ records: [] }),
    });
  });

  it('renders the page title', async () => {
    renderWithRouter(<Ziwei />);

    expect(screen.getByText('ziwei.title')).toBeInTheDocument();
  });

  it('renders birth date input fields', async () => {
    renderWithRouter(<Ziwei />);

    expect(screen.getByLabelText(/bazi\.birthYear/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bazi\.birthMonth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bazi\.birthDay/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bazi\.birthHour/i)).toBeInTheDocument();
  });

  it('renders gender selector', async () => {
    renderWithRouter(<Ziwei />);

    expect(screen.getByLabelText(/bazi\.gender/i)).toBeInTheDocument();
  });

  it('renders calculate button', async () => {
    renderWithRouter(<Ziwei />);

    expect(screen.getByRole('button', { name: /ziwei\.generateChart/i })).toBeInTheDocument();
  });

  it('updates input fields when user types', async () => {
    renderWithRouter(<Ziwei />);

    const yearInput = screen.getByLabelText(/bazi\.birthYear/i);
    fireEvent.change(yearInput, { target: { value: '1990' } });

    expect(yearInput).toHaveValue(1990);
  });

  it('allows gender selection', async () => {
    renderWithRouter(<Ziwei />);

    const genderSelect = screen.getByLabelText(/bazi\.gender/i);
    fireEvent.change(genderSelect, { target: { value: 'female' } });

    expect(genderSelect).toHaveValue('female');
  });

  it('renders breadcrumbs navigation', async () => {
    renderWithRouter(<Ziwei />);

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });
});

describe('Ziwei - Form Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = true;
    authState.isAuthResolved = true;
    authState.isAuthenticated = true;
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  it('shows error for invalid birth year', async () => {
    renderWithRouter(<Ziwei />);

    const yearInput = screen.getByLabelText(/bazi\.birthYear/i);
    fireEvent.change(yearInput, { target: { value: '1800' } });

    const submitButton = screen.getByRole('button', { name: /ziwei\.generateChart/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });
});
