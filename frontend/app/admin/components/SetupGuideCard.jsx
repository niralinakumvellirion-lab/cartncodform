'use client';

import React, { useEffect, useState } from 'react';
import { activateEmbedUrl } from '../../../lib/themeEditor';
import { getOnboarding, saveOnboardingStep } from '../lib/onboardingApi';

/**
 * Dashboard "Finish setup" card. Shown until the storefront block (app embed) step is done, so the
 * instructions stay one click away even when the first-open checklist was skipped. Hidden while loading,
 * on an error, and once the step is done.
 */
export default function SetupGuideCard({ shop }) {
  const [embedDone, setEmbedDone] = useState(null); // null = not known yet
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shop) return undefined;
    let cancelled = false;
    getOnboarding(shop)
      .then((s) => { if (!cancelled && s && s.steps) setEmbedDone(!!s.steps.embed); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shop]);

  if (!shop || embedDone !== false) return null;

  function openEditor() {
    window.open(activateEmbedUrl(shop), '_blank');
    setOpened(true);
  }

  async function markDone() {
    setSaving(true);
    setError('');
    try {
      await saveOnboardingStep(shop, 'embed', true);
      setEmbedDone(true);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={ui.card} aria-labelledby="ccf-setup-guide">
      <div style={ui.text}>
        <div style={ui.eyebrow}>Setup guide</div>
        <h2 id="ccf-setup-guide" style={ui.title}>Turn on the storefront block</h2>
        <p style={ui.sub}>
          Tracking and the notification prompt need the app embed on in your theme. The theme editor opens with
          it switched on: click <strong>Save</strong> there, then come back.
        </p>
        {error ? <p role="alert" style={ui.error}>{error}</p> : null}
      </div>
      <div style={ui.actions}>
        <button type="button" onClick={openEditor} style={ui.primary}>Turn on in theme editor ↗</button>
        <button type="button" onClick={markDone} disabled={saving} style={{ ...ui.secondary, ...(opened ? null : ui.quiet) }}>
          {saving ? 'Saving…' : "I've turned it on"}
        </button>
      </div>
    </section>
  );
}

const ui = {
  card: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fff', border: '1px solid #E5E7EB', borderLeft: '4px solid #111827', borderRadius: 12, padding: '16px 18px', margin: '16px 24px 0' },
  text: { flex: '1 1 320px', minWidth: 0 },
  eyebrow: { fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6B7280' },
  title: { fontSize: 15, fontWeight: 600, color: '#111827', margin: '2px 0 4px' },
  sub: { fontSize: 13, color: '#4B5563', margin: 0, lineHeight: 1.5 },
  error: { fontSize: 12, color: '#B91C1C', margin: '6px 0 0' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primary: { fontSize: 13, fontWeight: 600, color: '#fff', background: '#111827', border: 'none', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', whiteSpace: 'nowrap' },
  secondary: { fontSize: 13, fontWeight: 500, color: '#374151', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap' },
  quiet: { color: '#6B7280' },
};
