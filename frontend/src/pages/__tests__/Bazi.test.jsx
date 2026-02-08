import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the custom hook
vi.mock('../../components/bazi/useBaziCalculation', () => ({
  default: () => ({
    t: (key) => key,
    formData: {
      birthYear: 1990,
      birthMonth: 1,
      birthDay: 1,
      birthHour: 12,
      gender: 'male',
    },
    locationOptions: [],
    baseResult: null,
    fullResult: null,
    savedRecord: null,
    favoriteStatus: null,
    ziweiStatus: null,
    ziweiResult: null,
    ziweiLoading: false,
    toasts: [],
    errors: {},
    isCalculating: false,
    isFullLoading: false,
    isSaving: false,
    isFavoriting: false,
    isAiLoading: false,
    confirmResetOpen: false,
    confirmAiOpen: false,
    pendingRetry: null,
    isOnline: true,
    confirmResetCancelRef: { current: null },
    confirmAiCancelRef: { current: null },
    getRetryLabel: vi.fn(),
    attemptRetry: vi.fn(),
    clearPendingRetry: vi.fn(),
    statusStyle: vi.fn(),
    toastLabel: vi.fn(),
    updateField: vi.fn(),
    dateInputLimits: { minYear: 1900, maxYear: 2100 },
    handleCalculate: vi.fn(),
    handleFullAnalysis: vi.fn(),
    handleSaveRecord: vi.fn(),
    handleAddFavorite: vi.fn(),
    handleOpenHistory: vi.fn(),
    handleZiweiGenerate: vi.fn(),
    timeMeta: null,
    displayResult: null,
    elements: [],
    tenGodsList: [],
    maxTenGodStrength: 0,
    luckCyclesList: [],
    aiResult: null,
    displayAiResult: null,
    handleConfirmReset: vi.fn(),
    handleCancel: vi.fn(),
    handleConfirmAiRequest: vi.fn(),
    setConfirmResetOpen: vi.fn(),
    setConfirmAiOpen: vi.fn(),
    formatLocationLabel: vi.fn(),
    errorAnnouncement: null,
    isAuthenticated: false,
  }),
}));

import Bazi from '../Bazi';

const renderWithRouter = (component) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {component}
    </MemoryRouter>
  );
};

describe('Bazi Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main content area', () => {
    renderWithRouter(<Bazi />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders breadcrumbs navigation', () => {
    renderWithRouter(<Bazi />);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it('does not show retry banner when no pending retry', () => {
    renderWithRouter(<Bazi />);
    expect(screen.queryByTestId('retry-banner')).not.toBeInTheDocument();
  });
});
