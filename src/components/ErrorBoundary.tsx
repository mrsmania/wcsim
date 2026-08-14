import { Component, type ErrorInfo, type ReactNode } from 'react';

// A white screen is the worst failure mode: it hides what went wrong from the person
// who can least investigate it (someone on a phone). This turns any render-time
// exception into something readable, with the message and a way out.
//
// Deliberately plain inline styles, no Tailwind classes and no imports beyond React:
// it has to render even if the failure was caused by whatever it is wrapping.

interface State {
  error: Error | null;
}

const box: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: '48px 24px',
  fontFamily: 'system-ui, sans-serif',
  color: '#1c1c1a',
};

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render failed', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={box}>
        <h1 style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase' }}>
          Something broke
        </h1>
        <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
          The game hit an error it could not recover from. Nothing on the server was
          changed by this.
        </p>
        <pre
          style={{
            marginTop: 12,
            padding: 12,
            overflow: 'auto',
            background: '#f0ebe1',
            borderRadius: 6,
            fontSize: 11.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            padding: '10px 16px',
            border: '1px solid #16391f',
            background: '#1e5631',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: 13,
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
