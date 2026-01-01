import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ZiweiPalaceCard from '../ZiweiPalaceCard';

// Mock translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

describe('ZiweiPalaceCard', () => {
  const mockPalace = {
    palace: { name: 'Life Palace', cn: '命宫' },
    branch: { name: 'Zi', element: 'Water' },
    stars: {
      major: [{ key: 'ziwei', name: 'Emperor', cn: '紫微' }],
      minor: [{ key: 'tianma', name: 'Horse', cn: '天马' }],
    },
  };

  it('renders palace name and branch', () => {
    render(<ZiweiPalaceCard palace={mockPalace} />);
    expect(screen.getByText('命宫')).toBeInTheDocument();
    expect(screen.getByText(/Zi/)).toBeInTheDocument();
  });

  it('renders major and minor stars', () => {
    render(<ZiweiPalaceCard palace={mockPalace} />);
    expect(screen.getByText('紫微')).toBeInTheDocument();
    expect(screen.getByText('天马')).toBeInTheDocument();
  });

  it('shows Ming Palace label when isMing is true', () => {
    render(<ZiweiPalaceCard palace={mockPalace} isMing={true} />);
    expect(screen.getByText('ziwei.mingPalace')).toBeInTheDocument();
  });

  it('shows Shen Palace label when isShen is true', () => {
    render(<ZiweiPalaceCard palace={mockPalace} isShen={true} />);
    expect(screen.getByText('ziwei.shenPalace')).toBeInTheDocument();
  });

  it('applies correct class for highlighting', () => {
    const { container } = render(<ZiweiPalaceCard palace={mockPalace} isMing={true} />);
    expect(container.firstChild).toHaveClass('border-gold-400/80');
  });
});
