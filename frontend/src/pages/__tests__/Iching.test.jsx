import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = {
    token: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
};

vi.mock('../../auth/AuthContext', () => ({
    useAuth: () => authState,
}));

vi.mock('../../auth/useAuthFetch', () => ({
    useAuthFetch: () => vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
    }),
}));

vi.mock('../../utils/aiProvider', () => ({
    getPreferredAiProvider: () => 'openai',
}));

vi.mock('../../utils/apiError', () => ({
    readApiErrorMessage: vi.fn().mockResolvedValue('Error message'),
}));

// Mock fetch
global.fetch = vi.fn();

import Iching from '../Iching';

const renderWithRouter = (component) => {
    return render(
        <MemoryRouter>
            {component}
        </MemoryRouter>
    );
};

describe('Iching', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authState.token = null;
        authState.isAuthenticated = false;
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ hexagrams: [] }),
        });
    });

    it('renders the page title and subtitle', async () => {
        renderWithRouter(<Iching />);

        expect(screen.getByText('iching.title')).toBeInTheDocument();
        expect(screen.getByText('iching.subtitle')).toBeInTheDocument();
    });

    it('renders number input fields', async () => {
        renderWithRouter(<Iching />);

        expect(screen.getByPlaceholderText('12')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('27')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('44')).toBeInTheDocument();
    });

    it('renders question input field', async () => {
        renderWithRouter(<Iching />);

        expect(screen.getByPlaceholderText('iching.questionPlaceholder')).toBeInTheDocument();
    });

    it('renders divine buttons', async () => {
        renderWithRouter(<Iching />);

        expect(screen.getByRole('button', { name: /iching\.divineNumbers/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /iching\.divineTime/i })).toBeInTheDocument();
    });

    it('updates number inputs when user types', async () => {
        renderWithRouter(<Iching />);

        const firstInput = screen.getByPlaceholderText('12');
        fireEvent.change(firstInput, { target: { value: '25' } });

        expect(firstInput).toHaveValue(25);
    });

    it('updates question input when user types', async () => {
        renderWithRouter(<Iching />);

        const questionInput = screen.getByPlaceholderText('iching.questionPlaceholder');
        fireEvent.change(questionInput, { target: { value: 'What should I do?' } });

        expect(questionInput).toHaveValue('What should I do?');
    });

    it('shows validation errors for empty number fields', async () => {
        renderWithRouter(<Iching />);

        const submitButton = screen.getByRole('button', { name: /iching\.divineNumbers/i });
        fireEvent.click(submitButton);

        // Should show error status
        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument();
        });
    });

    it('calls fetch for hexagrams on mount', async () => {
        renderWithRouter(<Iching />);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/iching/hexagrams');
        });
    });

    it('shows login prompt for unauthenticated users', async () => {
        renderWithRouter(<Iching />);

        expect(screen.getByText('protected.title')).toBeInTheDocument();
        expect(screen.getByText('iching.loginRequiredSave')).toBeInTheDocument();
    });

    it('renders register and login buttons for guests', async () => {
        renderWithRouter(<Iching />);

        expect(screen.getByRole('button', { name: /login\.registerSubmit/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /nav\.login/i })).toBeInTheDocument();
    });
});

describe('Iching - Authenticated', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authState.token = 'test-token';
        authState.isAuthenticated = true;
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ hexagrams: [], records: [] }),
        });
    });

    it('fetches hexagrams list on mount', async () => {
        renderWithRouter(<Iching />);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/iching/hexagrams');
        });
    });
});
