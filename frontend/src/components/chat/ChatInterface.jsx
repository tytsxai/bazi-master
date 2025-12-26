import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { useChat } from '../../hooks/useChat';
import Button from '../ui/Button';

export default function ChatInterface({ isOpen, onClose }) {
    const { t } = useTranslation();
    const { token, isAuthenticated } = useAuth();
    const { messages, isTyping, status, sendMessage, connect, disconnect } = useChat();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

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
        <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-md sm:w-96">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🔮</span>
                    <div>
                        <h3 className="text-sm font-semibold text-white">{t('chat.title', 'Fortune Assistant')}</h3>
                        <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            <span className="text-[10px] text-white/50">
                                {status === 'connected' ? t('chat.online', 'Online') : t('chat.offline', 'Offline')}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                    ✕
                </button>
            </div>

            {/* Messages */}
            <div className="h-80 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                {messages.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center text-center text-white/40">
                        <span className="mb-2 text-2xl">👋</span>
                        <p className="text-xs">{t('chat.placeholder', 'Ask about your Bazi or general fortune...')}</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-br-sm'
                                : msg.role === 'system'
                                    ? 'bg-rose-900/50 text-rose-200 border border-rose-500/20'
                                    : 'bg-white/10 text-white/90 rounded-bl-sm'
                                }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-white/10 rounded-2xl px-3 py-2 rounded-bl-sm">
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/10 bg-white/5 p-3">
                {status === 'connected' ? (
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder={t('chat.inputPlaceholder', 'Type a message...')}
                            className="flex-1 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none"
                            disabled={isTyping}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isTyping}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-50"
                        >
                            ↑
                        </button>
                    </div>
                ) : (
                    <Button variant="ghost" size="sm" onClick={connect} className="w-full text-xs">
                        {t('chat.reconnect', 'Reconnect')}
                    </Button>
                )}
            </div>
        </div>
    );
}
