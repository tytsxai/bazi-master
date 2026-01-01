import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChatInterface from '../ChatInterface';
import { useChat } from '../../../hooks/useChat';
import { useAuth } from '../../../auth/AuthContext';

// Mock translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, def) => def || key }),
}));

// Mock Auth
vi.mock('../../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock useChat
vi.mock('../../../hooks/useChat', () => ({
  useChat: vi.fn(),
}));

describe('ChatInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();

    // Default Auth
    useAuth.mockReturnValue({ isAuthenticated: true, isAuthResolved: true });

    // Default Chat
    useChat.mockReturnValue({
      messages: [],
      isTyping: false,
      status: 'connected',
      sendMessage: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const { queryByText } = render(<ChatInterface isOpen={false} onClose={vi.fn()} />);
    expect(queryByText('Fortune Assistant')).not.toBeInTheDocument();
  });

  it('renders chat window when open', () => {
    render(<ChatInterface isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Fortune Assistant')).toBeInTheDocument();
    // Use role query since placeholder text varies by locale
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('connects to websocket on open if disconnected', () => {
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

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });

    // Find send button by aria-label
    const sendBtn = screen.getByLabelText('Send message');
    fireEvent.click(sendBtn);

    expect(sendMessage).toHaveBeenCalledWith('Hello');
  });

  it('displays messages', () => {
    useChat.mockReturnValue({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
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
