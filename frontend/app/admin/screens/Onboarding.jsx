'use client';

import { useState } from 'react';

const DS = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '24px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    marginBottom: 16,
  },
  cardFlat: {
    background: '#ffffff',
    border: '1px solid #f0f0f0',
    borderRadius: 14,
    padding: '20px 24px',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#0f0f0f',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    margin: '4px 0 0',
    fontWeight: 400,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
  },
  primary: '#4f46e5',
  primaryLight: '#eef2ff',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray900: '#111827',
  btnPrimary: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 9,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start' }}>
        <div>
          <h1 style={DS.pageTitle}>{title}</h1>
          {subtitle && (
            <p style={DS.pageSubtitle}>{subtitle}</p>
          )}
        </div>
        {action && (
          <div style={{ flexShrink: 0, marginTop: 2 }}>{action}</div>
        )}
      </div>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
                    borderRadius: 2, marginTop: 12, width: 48 }} />
    </div>
  );
}

// Storefront onboarding checklist. Per-step "done" and the overall
// "ccf_onboarded" flag live in localStorage (per browser) — see
// PHASE_G3_AUDIT open question re: CLAUDE.md "no localStorage in admin".

export default function Onboarding({ shop, onNavigate, onDone }) {
  const STEPS = [
    {
      id: 'embed',
      title: 'Turn on the storefront block',
      description:
        'Adds tracking and the notification prompt to your theme. One click in the theme editor.',
      actionLabel: 'Open theme editor',
      actionType: 'url',
      actionTarget: `https://${shop}/admin/themes/current/editor?context=apps`,
    },
    {
      id: 'voice',
      title: 'Set your voice',
      description:
        'Tone, emoji, language. Every message gets written in it. Currently: warm, emoji on, en.',
      actionLabel: 'Set up',
      actionType: 'nav',
      actionTarget: 'settings',
    },
    {
      id: 'signals',
      title: 'Choose what to act on',
      description: "Ten signals are on by default. Turn off any you don't want.",
      actionLabel: 'Set up',
      actionType: 'nav',
      actionTarget: 'settings',
    },
    {
      id: 'push',
      title: 'Send yourself a test',
      description:
        'A push to this browser so you can see what customers will see.',
      actionLabel: 'Send test',
      actionType: 'nav',
      actionTarget: 'customers',
    },
  ];

  const [steps, setSteps] = useState(() =>
    STEPS.map((step) => ({
      id: step.id,
      done:
        typeof window !== 'undefined' &&
        localStorage.getItem(`ccf_step_${step.id}_done`) === 'true',
    }))
  );

  const doneCount = steps.filter((s) => s.done).length;

  function toggleStep(id) {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const newDone = !s.done;
        try {
          localStorage.setItem(`ccf_step_${id}_done`, String(newDone));
        } catch (e) {
          /* storage unavailable — in-memory update still applies */
        }
        return { ...s, done: newDone };
      })
    );
  }

  function handleAction(step) {
    if (step.actionType === 'url') {
      window.open(step.actionTarget, '_blank');
      toggleStep(step.id);
    } else if (step.actionType === 'nav') {
      onNavigate(step.actionTarget);
      toggleStep(step.id);
    }
  }

  function finish() {
    try {
      localStorage.setItem('ccf_onboarded', 'true');
    } catch (e) {
      /* storage unavailable */
    }
    onDone();
  }

  function handleSkip() {
    finish();
  }

  function handleDone() {
    finish();
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        padding: '40px 20px',
      }}
    >
      <div style={{ maxWidth: '680px', width: '100%' }}>
        {/* Header */}
        <h1
          style={{
            ...DS.pageTitle,
            fontSize: 26,
            marginBottom: '8px',
          }}
        >
          Welcome to ShopiReachBoost AI
        </h1>
        <p
          style={{
            fontSize: '15px',
            color: '#6b7280',
            marginBottom: '32px',
          }}
        >
          Four steps. After this, it runs on its own — you&apos;ll open it to see
          what happened, not to do work.
        </p>

        {/* Progress card */}
        <div
          style={{
            ...DS.card,
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            padding: 0,
            marginBottom: '24px',
          }}
        >
          {/* Progress header */}
          <div
            style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <span
              style={{ fontSize: '14px', color: '#374151', fontWeight: '500', whiteSpace: 'nowrap' }}
            >
              {doneCount} of 4 done
            </span>
            {/* Progress bar */}
            <div
              style={{
                flex: 1,
                height: '6px',
                backgroundColor: '#e5e7eb',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(doneCount / 4) * 100}%`,
                  backgroundColor: '#111827',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Steps */}
          {STEPS.map((step, i) => {
            const isDone = steps.find((s) => s.id === step.id)?.done;
            return (
              <div
                key={step.id}
                style={{
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderBottom:
                    i < STEPS.length - 1 ? '1px solid #f3f4f6' : 'none',
                  opacity: isDone ? 0.6 : 1,
                }}
              >
                {/* Circle check */}
                <div
                  onClick={() => toggleStep(step.id)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: isDone ? 'none' : '2px solid #d1d5db',
                    backgroundColor: isDone ? '#111827' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.2s',
                  }}
                >
                  {isDone && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M2.5 7L5.5 10L11.5 4"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: '500',
                      color: '#111827',
                      textDecoration: isDone ? 'line-through' : 'none',
                      marginBottom: '2px',
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#6b7280',
                    }}
                  >
                    {step.description}
                  </div>
                </div>

                {/* Action button */}
                {!isDone && (
                  <button
                    onClick={() => handleAction(step)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#ffffff',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step.actionLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            onClick={handleSkip}
            style={{
              ...DS.btnSecondary,
              padding: '10px 20px',
              fontSize: '14px',
              background: 'transparent',
              border: '1px solid #d1d5db',
              color: '#6b7280',
            }}
          >
            Skip for now
          </button>
          <button
            onClick={handleDone}
            style={{
              ...DS.btnPrimary,
              padding: '10px 20px',
              fontSize: '14px',
            }}
          >
            Go to Today
          </button>
        </div>
      </div>
    </div>
  );
}
