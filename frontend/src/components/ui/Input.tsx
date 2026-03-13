"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export function Input({
  label,
  hint,
  error,
  mono = false,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-secondary">{label}</label>
      )}
      <input
        className={`
          w-full h-10 px-3 bg-navy-900 border border-border rounded-lg
          text-sm text-text-primary placeholder:text-text-muted
          focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/25
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${mono ? "font-mono text-xs" : "font-sans"}
          ${error ? "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/25" : ""}
          ${className}
        `}
        {...props}
      />
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = "", ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-secondary">{label}</label>
      )}
      <select
        className={`
          w-full h-10 px-3 bg-navy-900 border border-border rounded-lg
          text-sm text-text-primary
          focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/25
          transition-colors duration-150 cursor-pointer
          ${className}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
