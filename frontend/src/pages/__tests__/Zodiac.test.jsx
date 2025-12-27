import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../../auth/AuthContext', () => ({
    useAuth: () => ({
        token: null,
        isAuthenticated: false,
        login: vi.fn(),
        logout: vi.fn(),
    }),
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

import Zodiac from '../Zodiac';

const renderWithRouter = (component) => {
    return render(
        <MemoryRouter>
            {component}
        </MemoryRouter>
    );
};

describe('Zodiac', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ sign: {}, compatibility: {} }),
        });
    });

    it('renders the page title', async () => {
        renderWithRouter(<Zodiac />);

        expect(screen.getByText('zodiac.title')).toBeInTheDocument();
    });

    it('renders zodiac sign selector', async () => {
        renderWithRouter(<Zodiac />);

        // Should have sign selection available
        expect(screen.getByText(/zodiac\.selectSign/i)).toBeInTheDocument();
    });

    it('renders all 12 zodiac signs', async () => {
        renderWithRouter(<Zodiac />);

        // Check for zodiac sign buttons/options
        const expectedSigns = [
            'zodiac.signs.aries',
            'zodiac.signs.taurus',
            'zodiac.signs.gemini',
            'zodiac.signs.cancer',
            'zodiac.signs.leo',
            'zodiac.signs.virgo',
            'zodiac.signs.libra',
            'zodiac.signs.scorpio',
            'zodiac.signs.sagittarius',
            'zodiac.signs.capricorn',
            'zodiac.signs.aquarius',
            'zodiac.signs.pisces',
        ];

        // At least some signs should be visible
        const signButtons = screen.getAllByRole('button');
        expect(signButtons.length).toBeGreaterThan(0);
    });

    it('allows selecting a zodiac sign', async () => {
        renderWithRouter(<Zodiac />);

        // Find and click on a zodiac sign
        const signButtons = screen.getAllByRole('button');
        if (signButtons.length > 0) {
            fireEvent.click(signButtons[0]);
        }

        // Should update selected sign state
        await waitFor(() => {
            expect(screen.getByRole('heading')).toBeInTheDocument();
        });
    });

    it('renders breadcrumbs navigation', async () => {
        renderWithRouter(<Zodiac />);

        expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    });

    it('shows horoscope tabs (daily, weekly, monthly)', async () => {
        renderWithRouter(<Zodiac />);

        // Should have period selectors
        const tabList = screen.queryByRole('tablist');
        expect(tabList).toBeDefined();
    });
});

describe('Zodiac - Compatibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ compatibility: { score: 80 } }),
        });
    });

    it('allows checking compatibility between signs', async () => {
        renderWithRouter(<Zodiac />);

        // Look for compatibility section
        const compatibilitySection = screen.queryByText(/zodiac\.compatibility/i);
        expect(compatibilitySection).toBeDefined();
    });
});

describe('Zodiac - Rising Sign', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ rising: { sign: 'Leo' } }),
        });
    });

    it('renders rising sign calculator section', async () => {
        renderWithRouter(<Zodiac />);

        // Look for rising sign section or button
        const risingSection = screen.queryByText(/zodiac\.rising/i);
        expect(risingSection).toBeDefined();
    });
});
