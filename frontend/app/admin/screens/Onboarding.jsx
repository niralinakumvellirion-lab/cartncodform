'use client';

import { useState } from 'react';

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
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '8px',
          }}
        >
          Welcome to CartnCodForm
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
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
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
              padding: '10px 20px',
              fontSize: '14px',
              color: '#6b7280',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Skip for now
          </button>
          <button
            onClick={handleDone}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#ffffff',
              background: '#111827',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Go to Today
          </button>
        </div>
      </div>
    </div>
  );
}
