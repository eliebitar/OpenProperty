import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center min-h-[60vh]">
          <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 space-y-4 shadow-lg">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
              <AlertTriangle className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                {this.props.fallbackTitle || "Something went wrong"}
              </h2>
              <p className="text-xs text-muted-foreground">
                An unexpected error occurred while displaying this page.
              </p>
            </div>
            {this.state.error?.message && (
              <pre className="text-[11px] p-3 rounded-xl bg-background/80 border border-border text-left overflow-x-auto text-muted-foreground font-mono">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
                className="gap-1.5 text-xs font-semibold rounded-xl"
              >
                <Home className="size-3.5" />
                <span>Go to Dashboard</span>
              </Button>
              <Button
                size="sm"
                onClick={this.handleReset}
                className="gap-1.5 text-xs font-semibold rounded-xl"
              >
                <RefreshCw className="size-3.5" />
                <span>Reload Page</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
