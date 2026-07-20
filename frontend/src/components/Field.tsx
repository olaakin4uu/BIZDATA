'use client';
import React, { useId } from 'react';

/**
 * Form primitives with built-in label association and error display.
 *
 * The app previously rendered ~93 bare `<label>`s with only 3 `htmlFor`s, so
 * screen readers never announced the label and tapping it didn't focus the
 * field. These self-generate an id, wire `htmlFor`/`aria-describedby`, and render
 * an inline, field-level error tied to the control via `aria-invalid`. Borders
 * route through the `--line` token so inputs participate in tenant theming.
 */

const CONTROL =
  'w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] transition-colors';

interface ShellProps {
  id: string;
  label?: React.ReactNode;
  error?: string | null;
  hint?: React.ReactNode;
  required?: boolean;
  wrapperClassName?: string;
  children: React.ReactNode;
}

/** Low-level label/error shell for custom controls that render their own input. */
export function Field({ id, label, error, hint, required, wrapperClassName = '', children }: ShellProps) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
          {label}
          {required && <span className="ml-0.5 text-[var(--bad)]" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-[var(--bad)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-[var(--ink-3)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Common = {
  label?: React.ReactNode;
  error?: string | null;
  hint?: React.ReactNode;
  wrapperClassName?: string;
};

function describedBy(id: string, error?: string | null, hint?: React.ReactNode) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> &
  Common & { id?: string };

export function Input({ label, error, hint, required, wrapperClassName, className = '', id: idProp, ...props }: InputProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required} wrapperClassName={wrapperClassName}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${error ? 'border-[var(--bad)]' : 'border-[var(--line)] focus:border-teal-500'} ${className}`}
        {...props}
      />
    </Field>
  );
}

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> &
  Common & { id?: string };

export function Select({ label, error, hint, required, wrapperClassName, className = '', id: idProp, children, ...props }: SelectProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required} wrapperClassName={wrapperClassName}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${error ? 'border-[var(--bad)]' : 'border-[var(--line)] focus:border-teal-500'} ${className}`}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

export type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> &
  Common & { id?: string };

export function Textarea({ label, error, hint, required, wrapperClassName, className = '', id: idProp, ...props }: TextareaProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required} wrapperClassName={wrapperClassName}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${error ? 'border-[var(--bad)]' : 'border-[var(--line)] focus:border-teal-500'} ${className}`}
        {...props}
      />
    </Field>
  );
}

export default Field;
