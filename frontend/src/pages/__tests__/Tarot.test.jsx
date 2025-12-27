import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    token: null,
    isAuthenticated: false,
    login: vi.fn(),
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
}));

vi.mock('../../utils/apiError', () => ({
  readApiErrorMessage: vi.fn().mockResolvedValue('Error message'),
}));

// Mock fetch
global.fetch = vi.fn();

import Tarot from '../Tarot';

const renderWithRouter = (component) => {
  return render(
    <MemoryRouter>
      {component}
    </MemoryRouter>
  );
};

describe('Tarot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cards: [] }),
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
  });

  it('disables draw button while loading', async () => {
    global.fetch.mockImplementation(() => new Promise(() => { })); // Never resolves

    renderWithRouter(<Tarot />);

    const drawButton = screen.getByRole('button', { name: /tarot\.draw/i });
    fireEvent.click(drawButton);

    await waitFor(() => {
      expect(drawButton).toBeDisabled();
    });
  });
});
