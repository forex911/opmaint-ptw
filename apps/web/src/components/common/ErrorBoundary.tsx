import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled render error:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/permits';
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== 'production';

      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-800">
          <div className="max-w-md w-full bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              !
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Something went wrong while displaying this page
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              An unexpected error occurred during rendering. You can safely return to the permits list.
            </p>

            {isDev && this.state.error && (
              <div className="mb-6 p-3 bg-slate-100 rounded text-left overflow-auto max-h-48 border border-slate-200">
                <p className="text-xs font-mono text-rose-700 font-semibold mb-1">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="text-[10px] font-mono text-slate-600 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex justify-center">
              <a
                href="/permits"
                onClick={(e) => {
                  e.preventDefault();
                  this.handleReset();
                }}
                className="inline-flex items-center justify-center px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Back to Permits
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
