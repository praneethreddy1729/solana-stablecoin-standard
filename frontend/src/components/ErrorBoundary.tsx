"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="w-16 h-16 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Something went wrong
          </h2>
          <p className="text-text-muted mb-6 max-w-md">
            An unexpected error occurred while rendering the dashboard. Please
            refresh the page or try again.
          </p>
          <button
            onClick={this.handleRetry}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
