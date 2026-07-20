'use client';
import React from 'react';

/**
 * The single button primitive. Replaces ~55 hand-copied `bg-teal-600 …` variants
 * so padding, radius, disabled semantics, and — critically — the keyboard focus
 * ring are defined in exactly one place. Focus is left to the global
 * `:focus-visible` floor in globals.css (do NOT add `focus:outline-none` here).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-teal-600 text-white hover:bg-teal-700 border border-transparent',
  secondary:
    'bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] hover:bg-[var(--surface-2)]',
  danger: 'bg-[var(--bad)] text-white hover:brightness-95 border border-transparent',
  ghost: 'bg-transparent text-[var(--ink-2)] hover:bg-[var(--surface-2)] border border-transparent',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-lg gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the control. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

export default Button;
