import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useBaziCalculation from '../../components/bazi/useBaziCalculation';

vi.mock('../../utils/logger', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/clientId', () => ({
  getClientId: () => 'test-client-id',
}));

const authState = {
  isAuthenticated: true,
  isAuthResolved: true,
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

const wrapper = ({ children }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);
const noopListener = () => {};
const renderBaziHook = async () => {
  const rendered = renderHook(() => useBaziCalculation(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
};

describe('useBaziCalculation', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ locations: [] }),
    });
    vi.spyOn(window, 'addEventListener').mockImplementation(noopListener);
    vi.spyOn(window, 'removeEventListener').mockImplementation(noopListener);
    vi.spyOn(document, 'addEventListener').mockImplementation(noopListener);
    vi.spyOn(document, 'removeEventListener').mockImplementation(noopListener);
    global.WebSocket = vi.fn(() => ({
      close: vi.fn(),
      send: vi.fn(),
    }));
    global.sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default form data', async () => {
    const { result } = await renderBaziHook();

    expect(result.current.formData).toBeDefined();
    expect(result.current.formData.birthYear).toBeDefined();
    expect(result.current.formData.birthMonth).toBeDefined();
    expect(result.current.formData.birthDay).toBeDefined();
  });

  it('initializes with null results', async () => {
    const { result } = await renderBaziHook();

    expect(result.current.baseResult).toBeNull();
    expect(result.current.fullResult).toBeNull();
  });

  it('updates form data when updateField is called', async () => {
    const { result } = await renderBaziHook();

    act(() => {
      const handler = result.current.updateField('birthYear');
      handler({ target: { value: '1995' } });
    });

    const updatedYear = Number(result.current.formData.birthYear);
    expect(updatedYear).toBeGreaterThan(0);
  });

  it('validates form before calculation', async () => {
    const { result } = await renderBaziHook();

    act(() => {
      result.current.updateField('birthYear')({ target: { value: '' } });
    });

    const errorCount = Object.keys(result.current.errors).length;
    expect(errorCount).toBe(0);
  });

  it('clears errors on reset confirmation', async () => {
    const { result } = await renderBaziHook();

    act(() => {
      result.current.updateField('birthYear')({ target: { value: '' } });
    });

    const errorCount = Object.keys(result.current.errors).length;
    expect(errorCount).toBe(0);

    act(() => {
      result.current.handleConfirmReset();
    });

    expect(result.current.errors).toEqual({});
  });
});
