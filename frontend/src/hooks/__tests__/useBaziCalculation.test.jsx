import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useBaziCalculation from '../../components/bazi/useBaziCalculation';

const authState = {
  token: 'test-token',
  isAuthenticated: true,
  logout: vi.fn(),
  setRetryAction: vi.fn(),
  getRetryAction: vi.fn(() => null),
  clearRetryAction: vi.fn(),
};

const authFetchMock = vi.fn();
const baziContextState = {
  baziResult: null,
  setBaziResult: vi.fn(),
  clearBaziResult: vi.fn(),
};

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../auth/useAuthFetch', () => ({
  useAuthFetch: () => authFetchMock,
}));

vi.mock('../../context/BaziContext', () => ({
  useBaziContext: () => baziContextState,
}));

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useBaziCalculation', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ locations: [] }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default form data', () => {
    const { result } = renderHook(() => useBaziCalculation(), { wrapper });

    expect(result.current.formData).toBeDefined();
    expect(result.current.formData.birthYear).toBeDefined();
    expect(result.current.formData.birthMonth).toBeDefined();
    expect(result.current.formData.birthDay).toBeDefined();
  });

  it('initializes with null results', () => {
    const { result } = renderHook(() => useBaziCalculation(), { wrapper });

    expect(result.current.baseResult).toBeNull();
    expect(result.current.fullResult).toBeNull();
  });

  it('updates form data when updateField is called', () => {
    const { result } = renderHook(() => useBaziCalculation(), { wrapper });

    act(() => {
      const handler = result.current.updateField('birthYear');
      handler({ target: { value: '1995' } });
    });

    expect(result.current.formData.birthYear).toBe('1995');
  });

  it('validates form before calculation', async () => {
    const { result } = renderHook(() => useBaziCalculation(), { wrapper });

    act(() => {
      result.current.updateField('birthYear')({ target: { value: '' } });
    });

    await act(async () => {
      await result.current.handleCalculate({ preventDefault: vi.fn() });
    });

    expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);
  });

  it('clears errors on reset confirmation', () => {
    const { result } = renderHook(() => useBaziCalculation(), { wrapper });

    act(() => {
      result.current.updateField('birthYear')({ target: { value: '' } });
    });

    act(() => {
      result.current.handleCalculate({ preventDefault: vi.fn() });
    });

    act(() => {
      result.current.handleConfirmReset();
    });

    expect(result.current.errors).toEqual({});
  });
});
