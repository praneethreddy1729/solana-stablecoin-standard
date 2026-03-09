"use client";

import React from "react";

type BadgeVariant = "success" | "danger" | "warning" | "info" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  danger: "bg-red-500/15 text-red-400 border-red-500/25",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  info: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  neutral: "bg-slate-500/15 text-slate-400 border-slate-500/25",
};

const dotColors: Record<BadgeVariant, string> = {
  success: "bg-emerald-400",
  danger: "bg-red-400",
  warning: "bg-amber-400",
  info: "bg-cyan-400",
  neutral: "bg-slate-400",
};

export function Badge({ children, variant = "neutral", dot = false, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium
        rounded-full border
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}
