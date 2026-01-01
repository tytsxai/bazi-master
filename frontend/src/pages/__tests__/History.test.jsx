import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the custom hook
vi.mock('../../hooks/useHistoryData', () => ({
  default: () => ({
    status: 'idle',
    confirmState: null,
    setConfirmState: vi.fn(),
    confirmCancelRef: { current: null },
    handleConfirmAction: vi.fn(),
    handleIchingTimeDivine: vi.fn(),
    ichingTimeLoading: false,
    ichingTimeStatus: null,
    ichingTimeResult: null,
    getIchingStatusStyle: vi.fn(),
    deepLinkState: null,
    clearDeepLink: vi.fn(),
    handleExport: vi.fn(),
    isExporting: false,
    handleExportAll: vi.fn(),
    isExportingAll: false,
    fileInputRef: { current: null },
    handleImportFile: vi.fn(),
    isImporting: false,
    query: '',
    genderFilter: 'all',
    rangeFilter: 'all',
    sortOption: 'created-desc',
    isQueryActive: false,
    isGenderActive: false,
    isRangeActive: false,
    isSortActive: false,
    handleQueryChange: vi.fn(),
    handleGenderChange: vi.fn(),
    handleRangeChange: vi.fn(),
    handleSortChange: vi.fn(),
    handleClearFilter: vi.fn(),
    handleResetFilters: vi.fn(),
    orderedDeletedRecords: [],
    primaryRestoreId: null,
    showDeletedLocation: false,
    handleRestore: vi.fn(),
    requestHardDelete: vi.fn(),
    requestDelete: vi.fn(),
    filteredRecords: [],
    selectedIds: [],
    selectedSet: new Set(),
    selectAllRef: { current: null },
    allFilteredSelected: false,
    toggleSelectAll: vi.fn(),
    clearSelected: vi.fn(),
    requestBulkDelete: vi.fn(),
    toggleSelection: vi.fn(),
    startEdit: vi.fn(),
    editRecordId: null,
  }),
}));

import History from '../History';

const renderWithRouter = (component) => {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {component}
    </MemoryRouter>
  );
};

describe('History Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main content area', () => {
    renderWithRouter(<History />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders breadcrumbs navigation', () => {
    renderWithRouter(<History />);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it('renders the page title', () => {
    renderWithRouter(<History />);
    expect(screen.getByText('history.title')).toBeInTheDocument();
  });
});
