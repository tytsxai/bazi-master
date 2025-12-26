import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BaziForm from '../BaziForm.jsx';

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

describe('BaziForm', () => {
  const defaultProps = {
    t: (key) => key,
    formData: {
      birthYear: 1993,
      birthMonth: 6,
      birthDay: 18,
      birthHour: 12,
      locationKey: 'shanghai',
      timezone: 'Asia/Shanghai',
    },
    errors: {},
    dateInputLimits: {
      birthYear: { min: 1900, max: 2030 },
      birthMonth: { min: 1, max: 12 },
      birthDay: { min: 1, max: 31 },
      birthHour: { min: 0, max: 23 },
    },
    locationOptions: [
      { value: 'shanghai', label: 'Shanghai' },
      { value: 'beijing', label: 'Beijing' },
    ],
    formatLocationLabel: (option) => option.label,
    onFieldChange: vi.fn((field) => (e) => e.target.value),
    onSubmit: vi.fn((e) => e.preventDefault()),
    onOpenResetConfirm: vi.fn(),
    onCancel: vi.fn(),
    onFullAnalysis: vi.fn(),
    onOpenAiConfirm: vi.fn(),
    onSaveRecord: vi.fn(),
    onAddFavorite: vi.fn(),
    onOpenHistory: vi.fn(),
    isCalculating: false,
    isSaving: false,
    isFullLoading: false,
    isAiLoading: false,
    isFavoriting: false,
    isAuthenticated: false,
    baseResult: null,
    fullResult: null,
    savedRecord: null,
    favoriteStatus: null,
    errorAnnouncement: '',
  };

  it('renders form title and subtitle', () => {
    render(<BaziForm {...defaultProps} />);

    expect(screen.getByText('bazi.title')).toBeInTheDocument();
    expect(screen.getByText('bazi.subtitle')).toBeInTheDocument();
  });

  it('renders all required form fields', () => {
    render(<BaziForm {...defaultProps} />);

    expect(screen.getByLabelText('bazi.birthYear')).toBeInTheDocument();
    expect(screen.getByLabelText('bazi.birthMonth')).toBeInTheDocument();
    expect(screen.getByLabelText('bazi.birthDay')).toBeInTheDocument();
    expect(screen.getByLabelText('bazi.birthHour')).toBeInTheDocument();
    expect(screen.getByLabelText('bazi.location')).toBeInTheDocument();
  });

  it('displays form data values', () => {
    render(<BaziForm {...defaultProps} />);

    expect(screen.getByDisplayValue('1993')).toBeInTheDocument();
    expect(screen.getByDisplayValue('6')).toBeInTheDocument();
    expect(screen.getByDisplayValue('18')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
  });

  it('calls onFieldChange when input values change', () => {
    const mockOnFieldChange = vi.fn((field) => vi.fn());
    const props = { ...defaultProps, onFieldChange: mockOnFieldChange };

    render(<BaziForm {...props} />);

    const yearInput = screen.getByLabelText('bazi.birthYear');
    fireEvent.change(yearInput, { target: { value: '1994' } });

    expect(mockOnFieldChange).toHaveBeenCalledWith('birthYear');
  });

  it('calls onSubmit when form is submitted', () => {
    const mockOnSubmit = vi.fn((e) => e.preventDefault());
    const props = { ...defaultProps, onSubmit: mockOnSubmit };

    render(<BaziForm {...props} />);

    const form = screen.getByRole('form');
    fireEvent.submit(form);

    expect(mockOnSubmit).toHaveBeenCalled();
  });

  it('displays error messages when errors exist', () => {
    const props = {
      ...defaultProps,
      errors: {
        birthYear: 'Invalid year',
        birthMonth: 'Invalid month',
      },
    };

    render(<BaziForm {...props} />);

    expect(screen.getByText('Invalid year')).toBeInTheDocument();
    expect(screen.getByText('Invalid month')).toBeInTheDocument();
  });

  it('shows loading states for various operations', () => {
    const props = {
      ...defaultProps,
      isCalculating: true,
      isSaving: true,
      isFullLoading: true,
      isAiLoading: true,
      isFavoriting: true,
    };

    render(<BaziForm {...props} />);

    // Check that buttons are disabled or show loading text
    const calculateButton = screen.getByRole('button', { name: /bazi\.calculate/i });
    expect(calculateButton).toBeDisabled();
  });

  it('renders action buttons', () => {
    render(<BaziForm {...defaultProps} />);

    expect(screen.getByRole('button', { name: /bazi\.calculate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bazi\.reset/i })).toBeInTheDocument();
  });

  it('shows authenticated user actions when isAuthenticated is true', () => {
    const props = { ...defaultProps, isAuthenticated: true };

    render(<BaziForm {...props} />);

    // Should show additional buttons for authenticated users
    expect(screen.getByRole('button', { name: /bazi\.fullAnalysis/i })).toBeInTheDocument();
  });

  it('displays result sections when results are available', () => {
    const props = {
      ...defaultProps,
      baseResult: {
        chart: 'test chart',
        elements: { metal: 30, wood: 20, water: 25, fire: 15, earth: 10 },
      },
      fullResult: {
        interpretation: 'test interpretation',
      },
    };

    render(<BaziForm {...props} />);

    // Check that result sections are rendered
    expect(screen.getByText(/bazi\.result/i)).toBeInTheDocument();
  });

  it('announces errors via screen reader', () => {
    const props = {
      ...defaultProps,
      errorAnnouncement: 'Form validation error occurred',
    };

    render(<BaziForm {...props} />);

    const announcement = screen.getByRole('alert');
    expect(announcement).toHaveTextContent('Form validation error occurred');
  });
});

