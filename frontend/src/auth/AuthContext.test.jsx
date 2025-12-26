import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test component to consume context
function TestConsumer() {
    const { user, login, logout, isLoading, isAuthenticated } = useAuth();
    return (
        <div>
            <div data-testid="auth-status">{isAuthenticated ? 'Authenticated' : 'Guest'}</div>
            <div data-testid="user-email">{user?.email}</div>
            <div data-testid="is-loading">{isLoading ? 'Loading' : 'Idle'}</div>
            <button onClick={() => login('test@example.com', 'password')}>Login</button>
            <button onClick={() => logout()}>Logout</button>
        </div>
    );
}

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // Reset fetch mock
        global.fetch = vi.fn();
    });

    it('provides default values for guest user', () => {
        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        expect(screen.getByTestId('auth-status')).toHaveTextContent('Guest');
        expect(screen.getByTestId('user-email')).toBeEmptyDOMElement();
    });

    it('can login successfully', async () => {
        const user = userEvent.setup();
        const mockUser = { id: 1, email: 'test@example.com' };
        const mockToken = 'mock-token';

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: mockUser, token: mockToken }),
        });

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await user.click(screen.getByText('Login'));

        await waitFor(() => {
            expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
        });
        expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
        expect(localStorage.getItem('bazi_token')).toBe(mockToken);
    });

    it('handles login failure', async () => {
        const user = userEvent.setup();

        global.fetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Invalid credentials' }),
        });

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        // We expect the login function to throw, but since it's an event handler, React/Test boundary might catch it.
        // In our component, we just log in. The context `login` throws.
        // To test this properly without crashing the test runner, we might need to wrap the click or catch the error in component.
        // The current TestConsumer doesn't catch errors. 
        // Let's attach a consoleSpy to ignore the uncaught error if needed, 
        // or better, modify TestConsumer to handle error if we want to assert on UI feedback.
        // But keeping it simple for now, assume `login` throws and we want to verify state doesn't change.

        // Actually, create a component specifically for error handling test or wrap.
        // For now let's just assert that auth status remains Guest.

        // We need to swallow the error to prevent test failure from unhandled rejection?
        // Let's mock console.error
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        try {
            await act(async () => {
                await user.click(screen.getByText('Login'));
            });
        } catch (e) {
            // Expected
        }

        expect(screen.getByTestId('auth-status')).toHaveTextContent('Guest');
        consoleSpy.mockRestore();
    });

    it('can logout', async () => {
        const user = userEvent.setup();
        localStorage.setItem('bazi_token', 'token');
        localStorage.setItem('bazi_user', JSON.stringify({ email: 'test@example.com' }));

        global.fetch.mockResolvedValueOnce({ ok: true }); // Logout API call

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        // Initial state check
        expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');

        await user.click(screen.getByText('Logout'));

        await waitFor(() => {
            expect(screen.getByTestId('auth-status')).toHaveTextContent('Guest');
        });
        expect(localStorage.getItem('bazi_token')).toBeNull();
    });
});
