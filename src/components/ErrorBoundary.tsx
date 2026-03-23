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
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // TODO: Send to Sentry when configured
    // Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl font-bold text-destructive">!</span>
            </div>
            <h1 className="font-display text-xl font-bold mb-2">Algo salio mal</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Ocurrio un error inesperado. Podes intentar de nuevo o recargar la pagina.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.resetError}
                className="px-6 py-2.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors active:scale-[0.98]"
              >
                Intentar de nuevo
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors active:scale-[0.98]"
              >
                Recargar pagina
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
