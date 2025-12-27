import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../hooks/useChat';
import Button from '../ui/Button';

export default function ChatInterface({ isOpen, onClose }) {
    const { t } = useTranslation();
    const { status, messages, isTyping, sendMessage, connect } = useChat();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const focusTimeoutRef = useRef(null);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    useEffect(() => {
        if (isOpen && status === 'disconnected') {
            connect();
        }
        // Focus input when opening
        if (isOpen && status === 'connected') {
            focusTimeoutRef.current = setTimeout(() => inputRef.current?.focus(), 100);
        }
        return () => {
            // Cleanup timeout to prevent memory leak on unmount
            if (focusTimeoutRef.current) {
                clearTimeout(focusTimeoutRef.current);
                focusTimeoutRef.current = null;
            }
        };
    }, [isOpen, connect, status]);

    const handleSendMessage = () => {
        if (!input.trim()) return;
        sendMessage(input);
        setInput('');
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex h-[500px] max-h-[80vh] w-80 flex-col overflow-hidden rounded-2xl border border-gold-400/20 bg-mystic-950/95 shadow-2xl backdrop-blur-xl sm:w-96">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gold-400/10 bg-mystic-900/50 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400/10 p-1.5 ring-1 ring-gold-400/20">
                        <span className="text-lg">🔮</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gold-100">{t('chat.title', 'Fortune Assistant')}</h3>
                        <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-400'}`} />
                            <span className="text-[10px] uppercase tracking-wider text-white/50">
                                {status === 'connected' ? t('chat.online', 'Online') : t('chat.offline', 'Offline')}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="group rounded-full p-2 text-gold-400/50 transition hover:bg-gold-400/10 hover:text-gold-400"
                    aria-label="Close chat"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gold-400/10 hover:scrollbar-thumb-gold-400/20">
                {messages.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center p-6 text-center text-white/40">
                        <div className="mb-4 rounded-full bg-white/5 p-4 ring-1 ring-white/10">
                            <span className="text-3xl">👋</span>
                        </div>
                        <p className="text-sm text-gold-100/70">{t('chat.welcome', 'Welcome!')}</p>
                        <p className="mt-1 text-xs">{t('chat.placeholder', 'Ask about your Bazi or general fortune...')}</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                ? 'bg-gold-500 text-mystic-950 rounded-br-sm font-medium'
                                : msg.role === 'system'
                                    ? 'bg-rose-900/40 text-rose-200 border border-rose-500/20 px-3 py-2 text-xs italic'
                                    : 'bg-white/10 text-slate-200 rounded-bl-sm border border-white/5'
                                }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-sm bg-white/5 px-4 py-3 border border-white/5">
                            <div className="flex gap-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-400/60" style={{ animationDelay: '0ms' }} />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-400/60" style={{ animationDelay: '150ms' }} />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-400/60" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gold-400/10 bg-mystic-900/30 p-3 backdrop-blur-sm">
                {status === 'connected' ? (
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder={t('chat.inputPlaceholder', 'Type a message...')}
                            className="flex-1 rounded-full border border-gold-400/20 bg-mystic-950/50 px-4 py-2.5 text-sm text-gold-100 placeholder-white/20 shadow-inner focus:border-gold-400/50 focus:bg-mystic-900 focus:outline-none focus:ring-1 focus:ring-gold-400/50 transition-all"
                            disabled={isTyping}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isTyping}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-500 text-mystic-950 shadow-lg shadow-gold-900/20 transition-all hover:bg-gold-400 hover:scale-105 hover:shadow-gold-500/20 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-gold-500"
                            aria-label="Send message"
                        >
                            <svg className="h-5 w-5 translate-x-px translate-y-[-1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <Button variant="ghost" size="sm" onClick={connect} className="w-full text-xs border-gold-400/30 text-gold-400 hover:bg-gold-400/10 hover:text-gold-300">
                        {t('chat.reconnect', 'Reconnect')}
                    </Button>
                )}
            </div>
        </div>
    );
}
