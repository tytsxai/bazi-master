import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TarotControls from '../TarotControls';

// Mock translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

// Mock shared UI components
vi.mock('../../ui/Button', () => ({
  default: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe('TarotControls', () => {
  const defaultProps = {
    question: '',
    spreadType: 'SingleCard',
    onQuestionChange: vi.fn(),
    onSpreadTypeChange: vi.fn(),
    loading: false,
    interpreting: false,
    onDraw: vi.fn(),
    isGuest: false,
  };

  it('renders input fields', () => {
    render(<TarotControls {...defaultProps} />);
    expect(screen.getByPlaceholderText('tarot.questionPlaceholder')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('calls onQuestionChange when input changes', () => {
    render(<TarotControls {...defaultProps} />);
    const input = screen.getByPlaceholderText('tarot.questionPlaceholder');
    fireEvent.change(input, { target: { value: 'Will I be rich?' } });
    expect(defaultProps.onQuestionChange).toHaveBeenCalledWith('Will I be rich?');
  });

  it('calls onSpreadTypeChange when select changes', () => {
    render(<TarotControls {...defaultProps} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ThreeCard' } });
    expect(defaultProps.onSpreadTypeChange).toHaveBeenCalledWith('ThreeCard');
  });

  it('calls onDraw when button is clicked', () => {
    render(<TarotControls {...defaultProps} />);
    const button = screen.getByText(/tarot.drawCard/);
    fireEvent.click(button);
    expect(defaultProps.onDraw).toHaveBeenCalled();
  });

  it('disables draw button when loading', () => {
    render(<TarotControls {...defaultProps} loading={true} />);
    const button = screen.getByText('tarot.shuffling');
    expect(button).toBeDisabled();
  });
});
