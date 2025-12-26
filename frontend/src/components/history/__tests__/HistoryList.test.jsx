import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import HistoryList from '../HistoryList.jsx';

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (options?.count !== undefined) {
        return `${key} ${options.count}`;
      }
      return key;
    },
  }),
}));

// Mock HistoryItem component
vi.mock('../HistoryItem.jsx', () => ({
  default: ({ record, onToggleSelection, onStartEdit, onRequestDelete }) => (
    <div data-testid={`history-item-${record.id}`}>
      <span>{record.birthYear}-{record.birthMonth}-{record.birthDay}</span>
      <button onClick={() => onToggleSelection(record.id)}>Select</button>
      <button onClick={() => onStartEdit(record.id)}>Edit</button>
      <button onClick={() => onRequestDelete(record.id)}>Delete</button>
    </div>
  ),
}));

describe('HistoryList', () => {
  const defaultProps = {
    orderedDeletedRecords: [],
    primaryRestoreId: null,
    showDeletedLocation: false,
    onRestore: vi.fn(),
    onRequestHardDelete: vi.fn(),
    filteredRecords: [
      {
        id: 1,
        birthYear: 1993,
        birthMonth: 6,
        birthDay: 18,
        birthHour: 12,
        birthLocation: 'Shanghai',
      },
      {
        id: 2,
        birthYear: 1990,
        birthMonth: 3,
        birthDay: 15,
        birthHour: 14,
        birthLocation: 'Beijing',
      },
    ],
    highlightRecordId: null,
    selectedIds: [],
    selectedSet: new Set(),
    allFilteredSelected: false,
    onToggleSelectAll: vi.fn(),
    onClearSelected: vi.fn(),
    onRequestBulkDelete: vi.fn(),
    onToggleSelection: vi.fn(),
    onStartEdit: vi.fn(),
    onRequestDelete: vi.fn(),
    editRecordId: null,
    editDraft: {},
    editErrors: {},
    editStatus: null,
    editSaving: false,
    onUpdateEditDraft: vi.fn(),
    onEditSave: vi.fn(),
    onCancelEdit: vi.fn(),
    totalPages: 3,
    page: 1,
    canGoPrev: false,
    canGoNext: true,
    buildPageHref: vi.fn((page) => `/history?page=${page}`),
    hasAnyRecords: true,
    hasActiveFilters: false,
    selectAllRef: { current: null },
  };

  const renderWithRouter = (component) => {
    return render(<BrowserRouter>{component}</BrowserRouter>);
  };

  it('renders filtered records as HistoryItem components', () => {
    renderWithRouter(<HistoryList {...defaultProps} />);

    expect(screen.getByTestId('history-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('history-item-2')).toBeInTheDocument();
  });

  it('renders select all checkbox', () => {
    renderWithRouter(<HistoryList {...defaultProps} />);

    const selectAllCheckbox = screen.getByLabelText('history.selectAll');
    expect(selectAllCheckbox).toBeInTheDocument();
    expect(selectAllCheckbox).not.toBeChecked();
  });

  it('shows selected count when items are selected', () => {
    const props = {
      ...defaultProps,
      selectedIds: [1, 2],
      selectedSet: new Set([1, 2]),
    };

    renderWithRouter(<HistoryList {...props} />);

    expect(screen.getByText('history.selectedCount 2')).toBeInTheDocument();
  });

  it('renders bulk delete button when items are selected', () => {
    const props = {
      ...defaultProps,
      selectedIds: [1],
      selectedSet: new Set([1]),
    };

    renderWithRouter(<HistoryList {...props} />);

    expect(screen.getByText('history.bulkDelete')).toBeInTheDocument();
  });

  it('renders deleted records section when there are deleted records', () => {
    const props = {
      ...defaultProps,
      orderedDeletedRecords: [
        {
          id: 3,
          birthYear: 1985,
          birthMonth: 12,
          birthDay: 25,
          birthHour: 10,
          birthLocation: 'Tokyo',
        },
      ],
    };

    renderWithRouter(<HistoryList {...props} />);

    expect(screen.getByText('history.deletedRecords')).toBeInTheDocument();
    expect(screen.getByTestId('history-deleted-card')).toBeInTheDocument();
  });

  it('shows location in deleted records when showDeletedLocation is true', () => {
    const props = {
      ...defaultProps,
      showDeletedLocation: true,
      orderedDeletedRecords: [
        {
          id: 3,
          birthYear: 1985,
          birthMonth: 12,
          birthDay: 25,
          birthHour: 10,
          birthLocation: 'Tokyo',
        },
      ],
    };

    renderWithRouter(<HistoryList {...props} />);

    expect(screen.getByText('1985-12-25 · 10:00 · Tokyo')).toBeInTheDocument();
  });

  it('calls onRestore when restore button is clicked', () => {
    const mockOnRestore = vi.fn();
    const props = {
      ...defaultProps,
      orderedDeletedRecords: [
        {
          id: 3,
          birthYear: 1985,
          birthMonth: 12,
          birthDay: 25,
          birthHour: 10,
          birthLocation: 'Tokyo',
        },
      ],
      onRestore: mockOnRestore,
    };

    renderWithRouter(<HistoryList {...props} />);

    const restoreButton = screen.getByText('history.restore');
    fireEvent.click(restoreButton);

    expect(mockOnRestore).toHaveBeenCalledWith(3);
  });

  it('calls onRequestHardDelete when delete permanently button is clicked', () => {
    const mockOnRequestHardDelete = vi.fn();
    const props = {
      ...defaultProps,
      orderedDeletedRecords: [
        {
          id: 3,
          birthYear: 1985,
          birthMonth: 12,
          birthDay: 25,
          birthHour: 10,
          birthLocation: 'Tokyo',
        },
      ],
      onRequestHardDelete: mockOnRequestHardDelete,
    };

    renderWithRouter(<HistoryList {...props} />);

    const deleteButton = screen.getByText('history.deletePermanently');
    fireEvent.click(deleteButton);

    expect(mockOnRequestHardDelete).toHaveBeenCalledWith(props.orderedDeletedRecords[0]);
  });

  it('calls onToggleSelectAll when select all checkbox is clicked', () => {
    const mockOnToggleSelectAll = vi.fn();
    const props = {
      ...defaultProps,
      onToggleSelectAll: mockOnToggleSelectAll,
    };

    renderWithRouter(<HistoryList {...props} />);

    const selectAllCheckbox = screen.getByLabelText('history.selectAll');
    fireEvent.click(selectAllCheckbox);

    expect(mockOnToggleSelectAll).toHaveBeenCalled();
  });

  it('calls onClearSelected when clear selection button is clicked', () => {
    const mockOnClearSelected = vi.fn();
    const props = {
      ...defaultProps,
      selectedIds: [1],
      selectedSet: new Set([1]),
      onClearSelected: mockOnClearSelected,
    };

    renderWithRouter(<HistoryList {...props} />);

    const clearButton = screen.getByText('history.clearSelection');
    fireEvent.click(clearButton);

    expect(mockOnClearSelected).toHaveBeenCalled();
  });

  it('renders pagination controls', () => {
    renderWithRouter(<HistoryList {...defaultProps} />);

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('shows previous/next navigation when available', () => {
    renderWithRouter(<HistoryList {...defaultProps} />);

    expect(screen.getByText('history.next')).toBeInTheDocument();
  });
});


