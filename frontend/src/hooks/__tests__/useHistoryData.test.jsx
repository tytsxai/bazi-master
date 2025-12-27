import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useHistoryData from '../useHistoryData';

const authState = {
  token: null,
  isAuthenticated: false,
};

const authFetchMock = vi.fn();

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../auth/useAuthFetch', () => ({
  useAuthFetch: () => authFetchMock,
}));

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useHistoryData', () => {
  const t = (key) => key;

  it('initializes filters and records', () => {
    const { result } = renderHook(() => useHistoryData({ t }), { wrapper });

    expect(result.current.records).toEqual([]);
    expect(result.current.query).toBe('');
    expect(result.current.genderFilter).toBe('all');
    expect(result.current.rangeFilter).toBe('all');
    expect(result.current.sortOption).toBe('created-desc');
  });

  it('updates query and active flag', () => {
    const { result } = renderHook(() => useHistoryData({ t }), { wrapper });

    act(() => {
      result.current.handleQueryChange('test query');
    });

    expect(result.current.query).toBe('test query');
    expect(result.current.isQueryActive).toBe(true);
  });

  it('resets filters to defaults', () => {
    const { result } = renderHook(() => useHistoryData({ t }), { wrapper });

    act(() => {
      result.current.handleQueryChange('foo');
      result.current.handleGenderChange('female');
      result.current.handleRangeChange('7');
      result.current.handleSortChange('birth-asc');
    });

    act(() => {
      result.current.handleResetFilters();
    });

    expect(result.current.query).toBe('');
    expect(result.current.genderFilter).toBe('all');
    expect(result.current.rangeFilter).toBe('all');
    expect(result.current.sortOption).toBe('created-desc');
  });

  it('toggles selected ids', () => {
    const { result } = renderHook(() => useHistoryData({ t }), { wrapper });

    act(() => {
      result.current.toggleSelection(42);
    });

    expect(result.current.selectedIds).toContain(42);

    act(() => {
      result.current.toggleSelection(42);
    });

    expect(result.current.selectedIds).not.toContain(42);
  });
});
