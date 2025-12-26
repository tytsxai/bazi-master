import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useBaziContext } from '../context/BaziContext';

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export const useChat = (options = {}) => {
    const { token } = useAuth();
    const { baziResult } = useBaziContext(); // Get latest Bazi result
    const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected, error
    const [messages, setMessages] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const [error, setError] = useState(null);
    const wsRef = useRef(null);
    const reconnectAttempts = useRef(0);
    const reconnectTimer = useRef(null);
    const shouldReconnect = useRef(true);

    // Resolve WebSocket URL based on current location
    const resolveWsUrl = useCallback(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const hostname = window.location.hostname;
        const port = window.location.port;

        // Handle dev environment specific port mapping if needed
        // If frontend is on 3000/5173, backend likely on 4000
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '4000') {
            // In dev, if proxy isn't handling WS perfectly, direct to backend port
            return `${protocol}://${hostname}:4000/ws/ai`;
        }

        // Production or same-origin
        return `${protocol}://${window.location.host}/ws/ai`;
    }, []);

    const connect = useCallback(() => {
        if (!token) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        setStatus('connecting');
        setError(null);

        try {
            const url = resolveWsUrl();
            // Append token to query params for initial handshake authentication if needed, 
            // or we can send it as the first message. 
            // Standard approach: Protocols often don't support custom headers in browser JS.
            // We'll trust the verify logic on backend usually checks protocols or first message.
            // Let's assume standard connection first.
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                setStatus('connected');
                reconnectAttempts.current = 0;
                // Optional: Send auth token immediately if backend expects it
                // ws.send(JSON.stringify({ type: 'auth', token }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleMessage(data);
                } catch (e) {
                    console.error('WS parse error', e);
                }
            };

            ws.onclose = (event) => {
                // event.code 1000 is normal closure
                setStatus('disconnected');
                if (shouldReconnect.current && event.code !== 1000) {
                    attemptReconnect();
                }
            };

            ws.onerror = (err) => {
                console.error('WS error', err);
                setStatus('error');
                setError('Connection error');
            };

        } catch (e) {
            console.error('Connection failed', e);
            setStatus('error');
            setError(e.message);
            attemptReconnect();
        }
    }, [token, resolveWsUrl]);

    const attemptReconnect = useCallback(() => {
        if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
            setError('Unable to connect to chat server.');
            return;
        }

        reconnectTimer.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
        }, RECONNECT_DELAY * Math.min(reconnectAttempts.current + 1, 5)); // Exponential backoff cap
    }, [connect]);

    const disconnect = useCallback(() => {
        shouldReconnect.current = false;
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        if (wsRef.current) {
            wsRef.current.close(1000, 'User initiated disconnect');
            wsRef.current = null;
        }
    }, []);

    const handleMessage = (data) => {
        switch (data.type) {
            case 'start':
                setIsTyping(true);
                setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now() }]);
                break;
            case 'chunk':
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'assistant') {
                        return [
                            ...prev.slice(0, -1),
                            { ...last, content: last.content + (data.content || '') }
                        ];
                    }
                    return prev;
                });
                break;
            case 'done':
                setIsTyping(false);
                break;
            case 'error':
                setIsTyping(false);
                setMessages(prev => [...prev, { role: 'system', content: `Error: ${data.message}`, timestamp: Date.now() }]);
                break;
            default:
                break;
        }
    };

    const sendMessage = useCallback((text) => {
        if (!text.trim() || status !== 'connected') return;

        const userMsg = { role: 'user', content: text.trim(), timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true); // AI is "thinking"

        const payload = {
            type: 'chat_request',
            payload: {
                messages: [
                    ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
                    { role: 'user', content: text.trim() }
                ],
                context: baziResult ? {
                    pillars: baziResult.pillars,
                    fiveElements: baziResult.fiveElements,
                    tenGods: baziResult.tenGods,
                    // heavy items like luckCycles can be included if prompt needs them
                    // Keep payload size reasonable
                } : null
            }
        };

        wsRef.current.send(JSON.stringify(payload));
    }, [status, messages, baziResult]);

    useEffect(() => {
        // Auto connect if token exists
        if (token) {
            shouldReconnect.current = true;
            connect();
        }
        return () => {
            disconnect();
        };
    }, [token, connect, disconnect]);

    return {
        status,
        messages,
        isTyping,
        error,
        sendMessage,
        connect,
        disconnect
    };
};
