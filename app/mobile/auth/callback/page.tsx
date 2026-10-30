'use client';

import { useEffect, useState } from 'react';

export default function MobileAuthCallbackPage() {
  const [params, setParams] = useState<{ code: string | null; state: string | null; error: string | null }>({
    code: null,
    state: null,
    error: null,
  });
  const [deepLinkUrl, setDeepLinkUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    setParams({ code, state, error });

    const target = `actiproc://mobile/auth/callback${window.location.search}`;
    setDeepLinkUrl(target);

    if (!error && (code || state)) {
      // Auto-trigger custom scheme to return to Actiproc Beta
      const timer = setTimeout(() => {
        try {
          window.location.href = target;
        } catch {
          // Handled by user clicking the fallback button
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0a0d14',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px',
      textAlign: 'center',
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: '#121722',
        border: '1px solid #1f293d',
        borderRadius: '16px',
        padding: '32px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          backgroundColor: '#3b82f6',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: '24px',
          fontWeight: 'bold',
        }}>
          A
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
          {params.error ? 'Giriş Başarısız' : 'Actiproc\'a Dönülüyor'}
        </h1>

        <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px', lineHeight: 1.5 }}>
          {params.error
            ? `Google yetkilendirmesi sırasında bir hata oluştu (${params.error}). Lütfen uygulamaya dönüp tekrar deneyin.`
            : 'Oturumunuz doğrulandı. Uygulama otomatik açılmazsa aşağıdaki butona dokunun.'}
        </p>

        {deepLinkUrl && !params.error && (
          <a
            href={deepLinkUrl}
            style={{
              display: 'inline-block',
              width: '100%',
              boxSizing: 'border-box',
              padding: '14px 20px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '15px',
              textDecoration: 'none',
              marginBottom: '12px',
            }}
          >
            Actiproc Beta Uygulamasını Aç
          </a>
        )}

        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '16px' }}>
          Actiproc Cross-Platform &bull; https://www.actiproc.com
        </p>
      </div>
    </div>
  );
}

