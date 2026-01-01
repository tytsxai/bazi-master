import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ZiweiForm from '../ZiweiForm';

// Mock translation
const mockT = (key) => key;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock shared UI components
vi.mock('../../ui/Button', () => ({
  default: ({ children, onClick, disabled, isLoading, type }) => (
    <button onClick={onClick} disabled={disabled || isLoading} type={type}>
      {children}
    </button>
  ),
}));

describe('ZiweiForm', () => {
  const defaultProps = {
    form: {
      birthYear: '',
      birthMonth: '',
      birthDay: '',
      birthHour: '',
      gender: 'female',
    },
    onChange: (field) => (e) => {},
    onSubmit: vi.fn((e) => e.preventDefault()),
    loading: false,
    saveLoading: false,
    errors: {},
    onReset: vi.fn(),
  };

  it('renders all input fields', () => {
    render(<ZiweiForm {...defaultProps} />);

    expect(screen.getByText('bazi.birthYear')).toBeInTheDocument();
    expect(screen.getByText('bazi.birthMonth')).toBeInTheDocument();
    expect(screen.getByText('bazi.birthDay')).toBeInTheDocument();
    expect(screen.getByText('bazi.birthHour')).toBeInTheDocument();
    expect(screen.getByText('bazi.gender')).toBeInTheDocument();
  });

  it('displays validation errors', () => {
    const props = {
      ...defaultProps,
      errors: {
        birthYear: 'Year is required',
        gender: 'Gender is required',
      },
    };
    render(<ZiweiForm {...props} />);

    expect(screen.getByText('Year is required')).toBeInTheDocument();
    expect(screen.getByText('Gender is required')).toBeInTheDocument();
  });

  it('calls onSubmit when form is submitted', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<ZiweiForm {...defaultProps} onSubmit={onSubmit} />);

    const submitBtn = screen.getByText('ziwei.generateChart');
    fireEvent.click(submitBtn);
    expect(onSubmit).toHaveBeenCalled();
  });

  it('calls onReset when reset button is clicked', () => {
    render(<ZiweiForm {...defaultProps} />);

    const resetBtn = screen.getByText('ziwei.reset');
    fireEvent.click(resetBtn);
    expect(defaultProps.onReset).toHaveBeenCalled();
  });

  it('disables submit button when loading', () => {
    render(<ZiweiForm {...defaultProps} loading={true} />);
    const submitBtn = screen.getByText('profile.calculating');
    expect(submitBtn).toBeDisabled();
  });
});
