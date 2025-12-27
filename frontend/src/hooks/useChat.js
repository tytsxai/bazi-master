import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useBaziContext } from '../context/BaziContext';

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export const useChat = () => {
  const { token } = useAuth();
  const { baziResult } = useBaziContext();
  const [status, setStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(messages);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);
  const shouldReconnect = useRef(true);
  const connectRef = useRef(() => { });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const resolveWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const hostname = window.location.hostname;
    const configuredBackendPort = import.meta.env?.VITE_BACKEND_PORT;

    if ((hostname === 'localhost' || hostname === '127.0.0.1') && configuredBackendPort) {
      return `${protocol}://${hostname}:${configuredBackendPort}/ws/ai`;
    }

    return `${protocol}://${host}/ws/ai`;
  }, []);

  const attemptReconnect = useCallback(() => {
    if (!shouldReconnect.current) return;
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      setError('Unable to connect to chat server.');
      return;
    }

    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    const nextDelay = RECONNECT_DELAY * Math.min(reconnectAttempts.current + 1, 5);
    reconnectTimer.current = setTimeout(() => {
      reconnectAttempts.current++;
      connectRef.current();
    }, nextDelay);
  }, []);

  const handleMessage = (data) => {
    switch (data.type) {
      case 'start':
        setIsTyping(true);
        setMessages((prev) => [...prev, { role: 'assistant', content: '', timestamp: Date.now() }]);
        break;
      case 'chunk':
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + (data.content || '') },
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
        setMessages((prev) => [...prev, { role: 'system', content: `Error: ${data.message}`, timestamp: Date.now() }]);
        break;
      default:
        break;
    }
  };

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);
    shouldReconnect.current = true;

    try {
      const url = resolveWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (err) {
          console.error('WS parse error', err);
        }
      };

      ws.onclose = (event) => {
        setStatus('disconnected');
        if (event.code !== 1000) attemptReconnect();
      };

      ws.onerror = (err) => {
        console.error('WS error', err);
        setStatus('error');
        setError('Connection error');
      };
    } catch (err) {
      console.error('Connection failed', err);
      setStatus('error');
      setError(err?.message || 'Connection failed');
      attemptReconnect();
    }
  }, [attemptReconnect, resolveWsUrl, token]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    if (wsRef.current) {
      wsRef.current.close(1000, 'User initiated disconnect');
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((text) => {
    const normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized || status !== 'connected') return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const userMsg = { role: 'user', content: normalized, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const history = messagesRef.current
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content }));

    const payload = {
      type: 'chat_request',
      token,
      payload: {
        messages: [...history, { role: 'user', content: normalized }],
        context: baziResult ? {
          pillars: baziResult.pillars,
          fiveElements: baziResult.fiveElements,
          tenGods: baziResult.tenGods,
        } : null,
      },
    };

    wsRef.current.send(JSON.stringify(payload));
  }, [baziResult, status, token]);

  useEffect(() => {
    if (!token) return () => { };
    const timer = setTimeout(() => {
      connect();
    }, 0);
    return () => {
      clearTimeout(timer);
      disconnect();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
  }, [connect, disconnect, token]);

  return {
    status,
    messages,
    isTyping,
    error,
    sendMessage,
    connect,
    disconnect,
  };
};
