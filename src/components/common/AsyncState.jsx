/**
 * AsyncState — Generic wrapper for async data states.
 * Renders one of four states: idle, loading, success, empty, error.
 *
 * Usage:
 *   <AsyncState state={coverageState}>
 *     <PieChart data={data} />
 *   </AsyncState>
 *
 * State shape:
 *   { status: 'idle' | 'loading' | 'success' | 'empty' | 'error', data?, error? }
 */
import React from 'react';

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      color: 'var(--text-secondary)',
      fontSize: '13px',
      gap: '12px',
    }}>
      <svg
        width="20" height="20" viewBox="0 0 24 24"
        style={{ animation: 'asyncState-spin 1s linear infinite' }}
      >
        <style>{`
          @keyframes asyncState-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--border-color)" strokeWidth="2" />
        <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="var(--bg-highlight)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Loading...
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ icon, title, description }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      color: 'var(--text-secondary)',
      textAlign: 'center',
    }}>
      {icon && (
        <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }}>
          {icon}
        </div>
      )}
      {title && (
        <div style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
          {title}
        </div>
      )}
      {description && (
        <div style={{ fontSize: '13px', maxWidth: '320px' }}>
          {description}
        </div>
      )}
    </div>
  );
}

// ─── Error State ─────────────────────────────────────────────────────────────
function ErrorState({ error, onRetry }) {
  const message = typeof error === 'string'
    ? error
    : error?.message || error?.statusText || 'An unexpected error occurred';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      color: 'var(--text-secondary)',
      textAlign: 'center',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '8px',
        color: '#f48771',
      }}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12z"/>
          <path d="M7.5 4h1v5h-1V4zm0 6h1v1h-1v-1z"/>
        </svg>
        <span style={{ fontSize: '15px', color: 'var(--text-primary)' }}>Error</span>
      </div>
      <div style={{ fontSize: '13px', marginBottom: '16px', maxWidth: '400px' }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '6px 16px',
            background: 'var(--bg-highlight)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// ─── Main AsyncState Component ────────────────────────────────────────────────
export default function AsyncState({
  state = { status: 'idle' },
  children,
  loadingComponent,
  emptyComponent,
  errorComponent,
  loadingProps = {},
  emptyProps = {},
  errorProps = {},
}) {
  const { status, data, error } = state;

  // Loading
  if (status === 'loading') {
    if (loadingComponent) return loadingComponent;
    return <Spinner {...loadingProps} />;
  }

  // Error
  if (status === 'error') {
    if (errorComponent) return errorComponent;
    return <ErrorState error={error} onRetry={errorProps.onRetry} />;
  }

  // Empty — children may render null, or data is empty
  const hasChildren = children !== undefined && children !== null;
  const isEmpty = status === 'empty' || (status === 'success' && (data === null || data === undefined || (Array.isArray(data) && data.length === 0)));

  if (isEmpty) {
    if (emptyComponent) return emptyComponent;
    return (
      <EmptyState
        icon={emptyProps.icon || '📂'}
        title={emptyProps.title || 'No data'}
        description={emptyProps.description || 'Nothing to display here.'}
      />
    );
  }

  // Success / idle — render children
  if (status === 'success' || status === 'idle') {
    return hasChildren ? children : null;
  }

  // Fallback
  return hasChildren ? children : null;
}
