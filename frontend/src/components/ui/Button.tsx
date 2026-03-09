"use client";

import React from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-600/20 active:bg-cyan-700",
  secondary:
    "bg-navy-700 hover:bg-navy-600 text-text-primary border border-border active:bg-navy-800",
  danger:
    "bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 active:bg-red-600/40",
  ghost:
    "bg-transparent hover:bg-navy-700 text-text-secondary active:bg-navy-800",
  success:
    "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 active:bg-emerald-600/40",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        transition-colors duration-150 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <span className="spinner w-4 h-4" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
