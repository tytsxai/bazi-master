import React from 'react';

export default function Card({ children, className = '', title, subtitle }) {
  return (
    <div className={`glass-card rounded-3xl border border-white/10 p-6 shadow-glass ${className}`}>
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h2 className="font-display text-2xl text-white">{title}</h2>}
          {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
