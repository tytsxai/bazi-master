import React from 'react';
import Spinner from './Spinner';

const VARIANTS = {
    primary: 'bg-gold-400 text-mystic-900 shadow-lg hover:scale-105 hover:bg-gold-300 border-transparent',
    secondary: 'bg-mystic-700 text-gold-100 shadow-lg hover:bg-mystic-600 border border-gold-500/20 hover:border-gold-400/40',
    ghost: 'bg-transparent text-white/70 border border-white/20 hover:border-white/40 hover:text-white',
    danger: 'bg-rose-500/10 text-rose-100 border border-rose-400/40 hover:border-rose-300 hover:text-rose-200',
    glass: 'bg-white/5 text-white border border-white/10 hover:bg-white/10',
};

const SIZES = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2 text-sm font-semibold',
    xl: 'px-8 py-3 font-bold text-base',
};

const Button = React.forwardRef(function Button({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled = false,
    className = '',
    type = 'button',
    fullWidth = false,
    ...rest
}, ref) {
    const baseClass = 'inline-flex items-center justify-center rounded-full transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';
    const variantClass = VARIANTS[variant] || VARIANTS.primary;
    const sizeClass = SIZES[size] || SIZES.md;
    const widthClass = fullWidth ? 'w-full' : '';

    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || isLoading}
            className={`${baseClass} ${variantClass} ${sizeClass} ${widthClass} ${className}`}
            {...rest}
        >
            {isLoading && <Spinner size="sm" className="mr-2" />}
            {children}
        </button>
    );
});

Button.displayName = 'Button';

export default Button;
