import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChatInterface from '../ChatInterface';

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, def) => def || key }),
}));

// Mock Auth
vi.mock('../../../auth/AuthContext', () => ({
    useAuth: vi.fn(() => ({ isAuthenticated: true, token: 'mock-token' })),
}));

// Mock useChat
vi.mock('../../hooks/useChat', () => ({
    useChat: vi.fn(() => ({
        messages: [],
        isTyping: false,
        status: 'connected',
        sendMessage: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
    })),
}));

describe('ChatInterface', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Default Auth
        const { useAuth } = await import('../../../auth/AuthContext');
        useAuth.mockReturnValue({ isAuthenticated: true, token: 'mock-token' });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders nothing when closed', () => {
        render(<ChatInterface isOpen={false} onClose={vi.fn()} />);
        expect(screen.queryByText('Fortune Assistant')).not.toBeInTheDocument();
    });

    it('renders chat window when open', () => {
        render(<ChatInterface isOpen={true} onClose={vi.fn()} />);
        expect(screen.getByText('Fortune Assistant')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });

    it('connects to websocket on open if disconnected', () => {
        const { useChat } = require('../../hooks/useChat');
        const connect = vi.fn();
        useChat.mockReturnValue({
            messages: [],
            isTyping: false,
            status: 'disconnected',
            sendMessage: vi.fn(),
            connect,
            disconnect: vi.fn(),
        });

        render(<ChatInterface isOpen={true} onClose={vi.fn()} />);
        expect(connect).toHaveBeenCalled();
    });

    it('sends message when input submitted', () => {
        const { useChat } = require('../../hooks/useChat');
        const sendMessage = vi.fn();
        useChat.mockReturnValue({
            messages: [],
            isTyping: false,
            status: 'connected',
            sendMessage,
            connect: vi.fn(),
            disconnect: vi.fn(),
        });

        render(<ChatInterface isOpen={true} onClose={vi.fn()} />);

        const input = screen.getByPlaceholderText('Type a message...');
        fireEvent.change(input, { target: { value: 'Hello' } });

        const sendBtn = screen.getByText('↑');
        fireEvent.click(sendBtn);

        expect(sendMessage).toHaveBeenCalledWith('Hello');
    });

    it('displays messages', () => {
        const { useChat } = require('../../hooks/useChat');
        useChat.mockReturnValue({
            messages: [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' }
            ],
            isTyping: false,
            status: 'connected',
            sendMessage: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
        });

        render(<ChatInterface isOpen={true} onClose={vi.fn()} />);
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('Hi there')).toBeInTheDocument();
    });
});
