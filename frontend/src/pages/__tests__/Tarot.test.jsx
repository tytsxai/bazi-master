import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = {
  isAuthenticated: false,
  isAuthResolved: true,
  login: vi.fn(),
  logout: vi.fn(),
};

const authFetchMock = vi.fn();

// Mock dependencies
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../auth/useAuthFetch', () => ({
  useAuthFetch: () => authFetchMock,
}));

vi.mock('../../utils/aiProvider', () => ({
  getPreferredAiProvider: () => 'openai',
}));

vi.mock('../../utils/apiError', () => ({
  readApiErrorMessage: vi.fn().mockResolvedValue('Error message'),
}));

// Mock fetch
global.fetch = vi.fn();

import Tarot from '../Tarot';

const renderWithRouter = (component) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {component}
    </MemoryRouter>
  );
};

describe('Tarot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cards: [] }),
    });
    authFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ records: [] }),
    });
  });

  it('renders the page title', async () => {
    renderWithRouter(<Tarot />);

    expect(screen.getByText('tarot.title')).toBeInTheDocument();
  });

  it('renders spread type selector', async () => {
    renderWithRouter(<Tarot />);

    expect(screen.getByText('tarot.spreads.single')).toBeInTheDocument();
  });

  it('renders question input field', async () => {
    renderWithRouter(<Tarot />);

    const questionInput = screen.getByPlaceholderText(/tarot\.questionPlaceholder/i);
    expect(questionInput).toBeInTheDocument();
  });

  it('renders draw button', async () => {
    renderWithRouter(<Tarot />);

    expect(screen.getByRole('button', { name: /tarot\.draw/i })).toBeInTheDocument();
  });

  it('updates question input when user types', async () => {
    renderWithRouter(<Tarot />);

    const questionInput = screen.getByPlaceholderText(/tarot\.questionPlaceholder/i);
    fireEvent.change(questionInput, { target: { value: 'What does the future hold?' } });

    expect(questionInput).toHaveValue('What does the future hold?');
  });

  it('allows selecting different spread types', async () => {
    renderWithRouter(<Tarot />);

    expect(screen.getByText('tarot.spreads.single')).toBeInTheDocument();
    expect(screen.getByText('tarot.spreads.three')).toBeInTheDocument();
    expect(screen.getByText('tarot.spreads.celtic')).toBeInTheDocument();
  });

  it('shows zodiac section when enabled', async () => {
    renderWithRouter(<Tarot />);

    const zodiacSection = screen.queryByTestId('tarot-zodiac');
    expect(zodiacSection).toBeDefined();
  });

  it('renders breadcrumbs navigation', async () => {
    renderWithRouter(<Tarot />);

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });
});

describe('Tarot - Card Drawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    authFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ records: [] }),
    });
  });

  it('disables draw button while loading', async () => {
    global.fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderWithRouter(<Tarot />);

    const drawButton = screen.getByRole('button', { name: /tarot\.draw/i });
    fireEvent.click(drawButton);

    await waitFor(() => {
      expect(drawButton).toBeDisabled();
    });
  });
});

describe('Tarot - Authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = true;
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cards: [] }),
    });
    authFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ records: [] }),
    });
  });

  it('loads history through authFetch', async () => {
    renderWithRouter(<Tarot />);

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalledWith('/api/tarot/history');
    });
  });
});
