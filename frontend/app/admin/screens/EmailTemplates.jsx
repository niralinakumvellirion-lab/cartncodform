'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import { GOOGLE_FONTS_HREF, SEGMENTS, EMPTY_DRAFT, draftFromTemplate } from './emailStudio/lib';
import TemplatePicker from './emailStudio/TemplatePicker';
import PhotoCard from './emailStudio/PhotoCard';
import LayoutCard from './emailStudio/LayoutCard';
import ColourCard from './emailStudio/ColourCard';
import FontCard from './emailStudio/FontCard';
import WordsCard from './emailStudio/WordsCard';
import PreviewStage from './emailStudio/PreviewStage';
import _eng from '../lib/emailEngine';

const { PRESETS: ENGINE_PRESETS, DEFAULT_LAYOUT_BY_TYPE } = _eng || {};

// ── Design tokens ─────────────────────────────────────────────────────────────
const DS = {
  page: {
    maxWidth: 1200,
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
  },
  pageTitle: { fontSize: 22, fontWeight: 800, color: '#0f0f0f', margin: 0, letterSpacing: '-0.3px' },
  pageSubtitle: { fontSize: 13, color: '#9ca3af', margin: '4px 0 0', fontWeight: 400 },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
  },
  label: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  input: {
    width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db',
    borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827',
  },
  btnPrimary: {
    background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 9,
    padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb',
    borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  btnDanger: {
    background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 9,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};

const STARTER_TYPES = ['special_offer', 'festival', 'normal'];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function EmailTemplatesScreen() {
  const searchParams = useSearchParams();
  const shopParam      = searchParams ? (searchParams.get('shop')     || '') : '';
  const templateParam  = searchParams ? (searchParams.get('template') || '') : '';
  const focusParam     = searchParams ? (searchParams.get('focus')    || '') : '';

  const photoCardRef = useRef(null);
  const templateAutoSelected = useRef(false);

  // Store brand data (for live preview)
  const [store, setStore] = useState({ shopName: '', logoUrl: null, primaryColor: null, shopDomain: '' });

  // Template list
  const [templates, setTemplates]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState('');
  const [seeding, setSeeding]         = useState(false);
  const [seedError, setSeedError]     = useState('');
  const [seedCount, setSeedCount]     = useState(0);
  const [justSeeded, setJustSeeded]   = useState(false);

  // Selection
  const [selectedId, setSelectedId]   = useState(null);
  const [isNew, setIsNew]             = useState(false);
  const [filter, setFilter]           = useState('all');
  const [confirmDel, setConfirmDel]   = useState(false);
  const [deleting, setDeleting]       = useState(false);

  // Draft + dirty state
  const [draft, setDraft]             = useState(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft]   = useState(null);
  const dirty = useMemo(() =>
    !!savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft),
  [draft, savedDraft]);

  // Discard confirm — pendingNav is a function to run after discard
  const [pendingNav, setPendingNav]   = useState(null);

  // Save
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState(null);
  const [saveOk, setSaveOk]           = useState(false);

  // Photo upload
  const [uploading, setUploading]     = useState(false);
  const [photoError, setPhotoError]   = useState('');
  const [photoCardKey, setPhotoCardKey] = useState(0);

  // Generate with AI
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState('');
  const [genNotice, setGenNotice]     = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [genConfirm, setGenConfirm]   = useState(false);

  // Send test
  const [sendRecipient, setSendRecipient] = useState('');
  const [sending, setSending]             = useState(false);
  const [sendResult, setSendResult]       = useState(null);

  // Broadcast
  const [broadcastSegment, setBroadcastSegment]           = useState('everyone');
  const [broadcastCount, setBroadcastCount]               = useState(null);
  const [broadcastCountLoading, setBroadcastCountLoading] = useState(false);
  const [broadcastConfirm, setBroadcastConfirm]           = useState(false);
  const [broadcasting, setBroadcasting]                   = useState(false);
  const [broadcastResult, setBroadcastResult]             = useState(null);

  // Load brand data for live preview
  useEffect(() => {
    const shop = shopParam || (typeof window !== 'undefined' && window.shopify?.config?.shop) || '';
    if (!shop) return;
    setStore(s => ({ ...s, shopDomain: shop }));
    apiGet(`/api/profiles/${encodeURIComponent(shop)}/settings`)
      .then(data => {
        setStore({
          shopName: data.shopName || '',
          logoUrl: data.logoUrl || null,
          primaryColor: data.primaryColor || null,
          shopDomain: shop,
        });
      })
      .catch(() => {});
  }, [shopParam]);

  // Load templates on mount
  useEffect(() => { loadTemplates(); }, []);

  // Auto-select template from ?template= param (once, after templates load)
  useEffect(() => {
    if (!templateParam || templateAutoSelected.current || templates.length === 0) return;
    const match = templates.find(t => t._id === templateParam);
    if (match) {
      templateAutoSelected.current = true;
      _doSelectTemplate(match);
      if (focusParam === 'photo') {
        // Defer until after render so the card is in the DOM
        setTimeout(() => {
          const el = photoCardRef.current;
          if (!el) return;
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          const reducedMotion = typeof window !== 'undefined' &&
            window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reducedMotion) {
            el.style.transition = 'box-shadow 0.25s';
            el.style.boxShadow = '0 0 0 3px #4f46e5';
            setTimeout(() => { el.style.boxShadow = ''; el.style.transition = ''; }, 1200);
          }
        }, 80);
      }
    }
  }, [templates, templateParam, focusParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast count
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function doFetch() {
      setBroadcastCountLoading(true);
      setBroadcastCount(null);
      try {
        const data = await apiGet(`/api/email-templates/count?segment=${encodeURIComponent(broadcastSegment)}`);
        if (!cancelled) setBroadcastCount(data.count);
      } catch {
        if (!cancelled) setBroadcastCount(null);
      } finally {
        if (!cancelled) setBroadcastCountLoading(false);
      }
    }
    doFetch();
    return () => { cancelled = true; };
  }, [selectedId, broadcastSegment]);

  // Load Google Fonts once for the parent page (so later font pickers can show preview)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector(`link[href*="fonts.googleapis.com"][data-etpl]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_HREF;
    link.setAttribute('data-etpl', '1');
    document.head.appendChild(link);
  }, []);

  // ── Data helpers ─────────────────────────────────────────────────────────────

  async function loadTemplates() {
    setLoading(true);
    setLoadError('');
    setSeedError('');
    try {
      const data = await apiGet('/api/email-templates');
      const list = data.templates || [];
      setTemplates(list);
      const presentTypes = new Set(list.map(t => t.type));
      if (STARTER_TYPES.some(type => !presentTypes.has(type))) {
        setLoading(false);
        await runSeed(list.length);
        return;
      }
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runSeed(prevCount = 0) {
    setSeeding(true);
    setSeedError('');
    try {
      const data = await apiSend('/api/email-templates/seed', 'POST', {});
      const newList = data.templates || [];
      setTemplates(newList);
      const added = newList.length - prevCount;
      if (data.seeded && added > 0) {
        setSeedCount(added);
        setJustSeeded(true);
      }
    } catch (e) {
      setSeedError(e.message || 'Could not generate starter templates.');
    } finally {
      setSeeding(false);
    }
  }

  function setDraftField(field, value) {
    setDraft(d => ({ ...d, [field]: value }));
    setSaveOk(false);
    setSaveError(null);
  }

  function tryNavigate(action) {
    if (dirty || uploading) {
      setPendingNav(() => action);
    } else {
      action();
    }
  }

  function executeNav() {
    if (pendingNav) {
      pendingNav();
      setPendingNav(null);
    }
  }

  function _doSelectTemplate(t) {
    const d = draftFromTemplate(t);
    setSelectedId(t._id);
    setIsNew(false);
    setDraft(d);
    setSavedDraft(d);
    setSaveError(null);
    setSaveOk(false);
    setConfirmDel(false);
    setSendResult(null);
    setSendRecipient('');
    setProductTitle('');
    setGenError('');
    setGenNotice('');
    setGenConfirm(false);
    setBroadcastSegment('everyone');
    setBroadcastCount(null);
    setBroadcastCountLoading(false);
    setBroadcastConfirm(false);
    setBroadcastResult(null);
    setPhotoError('');
    setPhotoCardKey(k => k + 1);
  }

  function _doStartNew() {
    setSelectedId(null);
    setIsNew(true);
    setDraft(EMPTY_DRAFT);
    setSavedDraft(EMPTY_DRAFT);
    setSaveError(null);
    setSaveOk(false);
    setConfirmDel(false);
    setSendResult(null);
    setSendRecipient('');
    setProductTitle('');
    setGenError('');
    setGenNotice('');
    setGenConfirm(false);
    setBroadcastSegment('everyone');
    setBroadcastCount(null);
    setBroadcastCountLoading(false);
    setBroadcastConfirm(false);
    setBroadcastResult(null);
    setPhotoError('');
    setPhotoCardKey(k => k + 1);
  }

  function selectTemplate(t) { tryNavigate(() => _doSelectTemplate(t)); }
  function startNew()         { tryNavigate(_doStartNew); }

  async function saveTemplate() {
    if (saving || uploading) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      let saved;
      if (selectedId) {
        const res = await apiSend(`/api/email-templates/${selectedId}`, 'PATCH', draft);
        saved = res.template;
        setTemplates(ts => ts.map(t => (t._id === selectedId ? saved : t)));
      } else {
        const res = await apiSend('/api/email-templates', 'POST', draft);
        saved = res.template;
        setTemplates(ts => [saved, ...ts]);
        setSelectedId(saved._id);
        setIsNew(false);
      }
      const d = draftFromTemplate(saved);
      setDraft(d);
      setSavedDraft(d);
      setSaveOk(true);
    } catch (e) {
      setSaveError(e.field ? { error: e.message, field: e.field } : e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedId || deleting) return;
    setDeleting(true);
    try {
      await apiSend(`/api/email-templates/${selectedId}`, 'DELETE', {});
      setTemplates(ts => ts.filter(t => t._id !== selectedId));
      setSelectedId(null);
      setIsNew(false);
      setDraft(EMPTY_DRAFT);
      setSavedDraft(null);
      setConfirmDel(false);
      setPhotoCardKey(k => k + 1);
    } catch (e) {
      setSaveError(e.message);
      setConfirmDel(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePhotoUpload(dataUrl, _file, clientErr) {
    if (clientErr) { setPhotoError(clientErr); return; }
    if (!dataUrl) return;
    setUploading(true);
    setPhotoError('');
    try {
      const data = await apiSend('/api/email-templates/photo', 'POST', { dataUrl });
      setDraft(d => ({ ...d, imageUrl: data.url, imgW: data.width, imgH: data.height }));
      setSavedDraft(sd => sd ? { ...sd, imageUrl: data.url, imgW: data.width, imgH: data.height } : sd);
    } catch (e) {
      setPhotoError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function handlePhotoRemove() {
    setDraft(d => ({ ...d, imageUrl: null, imgW: null, imgH: null }));
    setSaveOk(false);
  }

  function handleGenerateClick() {
    setGenError('');
    setGenNotice('');
    if (draft.subject.trim() || draft.body.trim()) {
      setGenConfirm(true);
    } else {
      runGenerate();
    }
  }

  async function runGenerate() {
    setGenConfirm(false);
    if (generating) return;
    setGenerating(true);
    setGenError('');
    setGenNotice('');
    try {
      const payload = { type: draft.type };
      if (productTitle.trim()) payload.productTitle = productTitle.trim();
      const data = await apiSend('/api/email-templates/generate', 'POST', payload);
      setDraft(d => ({
        ...d,
        subject:   data.subject   || d.subject,
        body:      data.body      || d.body,
        offerText: data.offerText != null ? (data.offerText || '') : d.offerText,
      }));
      setSaveOk(false);
      if (data.fallback) setGenNotice('AI unavailable — starter draft filled in.');
    } catch (e) {
      setGenError(e.message || 'Generate failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function sendEmail() {
    const recipient = sendRecipient.trim();
    if (!selectedId || !recipient || sending) return;
    setSending(true);
    setSendResult(null);
    try {
      const isEmail = recipient.includes('@');
      const data = await apiSend(`/api/email-templates/${selectedId}/send`, 'POST',
        isEmail ? { email: recipient } : { profileId: recipient }
      );
      const tip = data.warnings && data.warnings.includes('no_photo')
        ? ' Tip: this email has no offer photo.' : '';
      setSendResult({ ok: true, id: data.id, tip });
    } catch (e) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setSending(false);
    }
  }

  async function sendBroadcast() {
    if (!selectedId || broadcasting) return;
    setBroadcasting(true);
    setBroadcastConfirm(false);
    setBroadcastResult(null);
    try {
      const data = await apiSend(`/api/email-templates/${selectedId}/broadcast`, 'POST', { segment: broadcastSegment });
      const tip = data.warnings && data.warnings.includes('no_photo')
        ? ' Tip: this email has no offer photo.' : '';
      setBroadcastResult({ ok: true, sent: data.sent, failed: data.failed, tip });
    } catch (e) {
      setBroadcastResult({ ok: false, error: e.message });
    } finally {
      setBroadcasting(false);
    }
  }

  const showEditor = isNew || !!selectedId;
  const sendDisabled = dirty || uploading;
  const sendDisabledHint = sendDisabled ? 'Save your changes first' : '';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={DS.page}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={DS.pageTitle}>Email templates</h1>
            <p style={DS.pageSubtitle}>Design, preview, and send branded email templates.</p>
          </div>
        </div>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #4f46e5, #818cf8)', borderRadius: 2, marginTop: 12, width: 48 }} />

        {/* Presets chips */}
        {ENGINE_PRESETS && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Start with:</span>
            {Object.keys(ENGINE_PRESETS).map(k => {
              const p = ENGINE_PRESETS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setDraftField('layout', p.layout);
                    setDraftField('color',  p.color);
                    setDraftField('hFont',  p.hFont);
                    setDraftField('bFont',  p.bFont);
                    setDraftField('radius', p.radius);
                    setDraftField('pageBg', null);
                    setDraftField('cardBg', null);
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
                    background: '#f3f4f6', color: '#374151', border: '1.5px solid #e5e7eb', outline: 'none',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                  {p.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                if (!ENGINE_PRESETS) return;
                const keys = Object.keys(ENGINE_PRESETS);
                const p = ENGINE_PRESETS[keys[Math.floor(Math.random() * keys.length)]];
                setDraftField('layout', p.layout);
                setDraftField('color',  p.color);
                setDraftField('hFont',  p.hFont);
                setDraftField('bFont',  p.bFont);
                setDraftField('radius', p.radius);
                setDraftField('pageBg', null);
                setDraftField('cardBg', null);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
                background: '#4f46e5', color: '#fff', border: 'none', outline: 'none',
              }}
            >
              Surprise me
            </button>
          </div>
        )}
      </div>

      {/* Seed banner */}
      {justSeeded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, gap: 12 }}>
          <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>
            We drafted {seedCount} starter template{seedCount !== 1 ? 's' : ''} for you. Edit them to fit your brand, or send them as-is.
          </p>
          <button style={{ background: 'none', border: 'none', fontSize: 18, lineHeight: 1, cursor: 'pointer', color: '#166534', padding: '0 4px', flexShrink: 0 }} onClick={() => setJustSeeded(false)} aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}

      {/* Loading / seed / error states */}
      {(loading || seeding) && (
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
          {seeding ? 'Setting up your starter templates…' : 'Loading…'}
        </p>
      )}
      {!loading && !seeding && seedError && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 8px' }}>{seedError}</p>
          <button style={{ ...DS.btnSecondary, fontSize: 12, padding: '5px 12px' }} onClick={() => runSeed(templates.length)}>
            Try again
          </button>
        </div>
      )}
      {!loading && loadError && (
        <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 16 }}>{loadError}</p>
      )}

      {/* Discard confirm */}
      {pendingNav && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#92400e', flex: 1 }}>You have unsaved changes. Discard and continue?</span>
          <button style={{ ...DS.btnDanger, fontSize: 12, padding: '5px 12px' }} onClick={executeNav}>Discard</button>
          <button style={{ ...DS.btnSecondary, fontSize: 12, padding: '5px 12px' }} onClick={() => setPendingNav(null)}>Keep editing</button>
        </div>
      )}

      {/* Dirty bar */}
      {dirty && !pendingNav && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#92400e', flex: 1 }}>Unsaved changes</span>
          <button
            style={{ ...DS.btnPrimary, fontSize: 12, padding: '5px 14px' }}
            onClick={saveTemplate}
            disabled={saving || uploading}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            style={{ ...DS.btnSecondary, fontSize: 12, padding: '5px 12px' }}
            onClick={() => {
              if (savedDraft) { setDraft(savedDraft); setSaveError(null); setSaveOk(false); }
              else _doStartNew();
            }}
          >
            Discard
          </button>
        </div>
      )}

      {/* Two-column studio layout */}
      <div className="etpl-sgrid" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>

        {/* LEFT: picker + cards */}
        <div style={{ minWidth: 0 }}>
          {/* Template picker card */}
          <div style={{ ...DS.card, padding: '16px 20px', marginBottom: 0 }}>
            <TemplatePicker
              templates={templates}
              selectedId={selectedId}
              isNew={isNew}
              filter={filter}
              onFilterChange={setFilter}
              onSelect={selectTemplate}
              onNew={startNew}
              draft={draft}
              setDraftField={setDraftField}
              confirmDel={confirmDel}
              setConfirmDel={setConfirmDel}
              onDelete={deleteTemplate}
              deleting={deleting}
            />
          </div>

          {showEditor && (
            <>
              {/* Photo card */}
              <div ref={photoCardRef} style={{ marginTop: 12 }}>
                <PhotoCard
                  key={photoCardKey}
                  draft={draft}
                  uploading={uploading}
                  photoError={photoError}
                  onUpload={handlePhotoUpload}
                  onRemove={handlePhotoRemove}
                  onClearError={() => setPhotoError('')}
                />
              </div>

              {/* Layout card */}
              <LayoutCard draft={draft} setDraftField={setDraftField} saveError={saveError} />

              {/* Colour card */}
              <ColourCard draft={draft} setDraftField={setDraftField} store={store} saveError={saveError} />

              {/* Font card */}
              <FontCard draft={draft} setDraftField={setDraftField} saveError={saveError} />

              {/* Words card */}
              <WordsCard draft={draft} setDraftField={setDraftField} saveError={saveError} />

              {/* Save / error row */}
              <div style={{ marginBottom: 12 }}>
                {saveError && typeof saveError === 'string' && (
                  <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 8px' }}>{saveError}</p>
                )}
                {saveError && typeof saveError === 'object' && (
                  <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 8px' }}>{saveError.error}</p>
                )}
                {saveOk && (
                  <p style={{ fontSize: 13, color: '#16a34a', margin: '0 0 8px' }}>Saved.</p>
                )}
                <button
                  style={{ ...DS.btnPrimary, opacity: saving || uploading ? 0.7 : 1 }}
                  onClick={saveTemplate}
                  disabled={saving || uploading}
                >
                  {saving ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
                </button>
              </div>

              {/* Generate with AI */}
              <div style={{ ...DS.card, padding: '16px 20px', marginBottom: 12 }}>
                <p style={{ ...DS.sectionLabel, color: '#6d28d9' }}>Generate with AI</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={DS.label}>Product (optional)</label>
                    <input
                      style={DS.input}
                      value={productTitle}
                      onChange={e => { setProductTitle(e.target.value); setGenError(''); setGenNotice(''); setGenConfirm(false); }}
                      placeholder="e.g. Banarasi Silk Kurti"
                    />
                  </div>
                  <button
                    style={{ ...DS.btnSecondary, borderColor: '#c4b5fd', color: '#6d28d9', background: '#ede9fe', flexShrink: 0 }}
                    onClick={handleGenerateClick}
                    disabled={generating}
                  >
                    {generating ? 'Generating…' : 'Generate'}
                  </button>
                </div>
                {genConfirm && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>This will replace your current subject, body, and offer line.</span>
                    <button style={{ ...DS.btnSecondary, padding: '5px 12px', fontSize: 12 }} onClick={runGenerate}>Replace</button>
                    <button style={{ ...DS.btnSecondary, padding: '5px 12px', fontSize: 12 }} onClick={() => setGenConfirm(false)}>Cancel</button>
                  </div>
                )}
                {genNotice && <p style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '6px 10px', margin: '10px 0 0' }}>{genNotice}</p>}
                {genError  && <p style={{ fontSize: 12, color: '#dc2626', margin: '10px 0 0' }}>{genError}</p>}
              </div>

              {/* Send test */}
              {selectedId && (
                <div style={{ ...DS.card, padding: '16px 20px', marginBottom: 12 }}>
                  <p style={DS.sectionLabel}>Send test</p>
                  {sendDisabledHint && (
                    <p style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '5px 10px', margin: '0 0 10px' }}>{sendDisabledHint}</p>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label style={DS.label}>Customer email</label>
                      <input
                        style={DS.input}
                        type="email"
                        value={sendRecipient}
                        onChange={e => { setSendRecipient(e.target.value); setSendResult(null); }}
                        placeholder="customer@example.com"
                        disabled={sendDisabled}
                      />
                    </div>
                    <button style={{ ...DS.btnPrimary, opacity: sendDisabled ? 0.5 : 1 }} onClick={sendEmail} disabled={sendDisabled || sending || !sendRecipient.trim()}>
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {sendResult?.ok && (
                    <p style={{ fontSize: 13, color: '#16a34a', margin: '10px 0 0' }}>
                      Sent! Resend ID: {sendResult.id}{sendResult.tip}
                    </p>
                  )}
                  {sendResult && !sendResult.ok && (
                    <p style={{ fontSize: 13, color: '#dc2626', margin: '10px 0 0' }}>{sendResult.error}</p>
                  )}
                </div>
              )}

              {/* Broadcast */}
              {selectedId && (
                <div style={{ ...DS.card, padding: '16px 20px', marginBottom: 12 }}>
                  <p style={DS.sectionLabel}>Send to customers</p>
                  {sendDisabledHint && (
                    <p style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '5px 10px', margin: '0 0 10px' }}>{sendDisabledHint}</p>
                  )}
                  <div style={{ marginBottom: 12 }}>
                    <label style={DS.label}>Segment</label>
                    <select
                      style={{ ...DS.input, cursor: 'pointer' }}
                      value={broadcastSegment}
                      disabled={sendDisabled}
                      onChange={e => { setBroadcastSegment(e.target.value); setBroadcastConfirm(false); setBroadcastResult(null); }}
                    >
                      {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  {broadcastCountLoading && <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 12px' }}>Counting…</p>}
                  {!broadcastCountLoading && broadcastCount === 0 && <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 12px' }}>No customers match this segment.</p>}
                  {!broadcastCountLoading && broadcastCount !== null && broadcastCount > 0 && broadcastCount <= 90 && (
                    <p style={{ fontSize: 13, color: '#374151', margin: '0 0 12px' }}>{broadcastCount} customers will receive this.</p>
                  )}
                  {!broadcastCountLoading && broadcastCount !== null && broadcastCount > 90 && (
                    <p style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '6px 10px', margin: '0 0 12px' }}>
                      Free plan sends up to ~90 at once. {broadcastCount} match — narrow the segment.
                    </p>
                  )}
                  {!broadcastConfirm && (
                    <button
                      style={{ ...DS.btnPrimary, opacity: sendDisabled ? 0.5 : 1 }}
                      disabled={sendDisabled || broadcasting || broadcastCountLoading || broadcastCount === null || broadcastCount === 0 || broadcastCount > 90}
                      onClick={() => setBroadcastConfirm(true)}
                    >
                      Send to {broadcastCount ?? '…'} customers
                    </button>
                  )}
                  {broadcastConfirm && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>Send to {broadcastCount} customers? This can&apos;t be undone.</span>
                      <button style={DS.btnPrimary} onClick={sendBroadcast} disabled={broadcasting}>{broadcasting ? `Sending…` : 'Confirm send'}</button>
                      <button style={DS.btnSecondary} onClick={() => setBroadcastConfirm(false)}>Cancel</button>
                    </div>
                  )}
                  {broadcastResult?.ok && (
                    <p style={{ fontSize: 13, color: '#16a34a', margin: '12px 0 0' }}>
                      Sent to {broadcastResult.sent}{broadcastResult.failed > 0 ? `, failed ${broadcastResult.failed}` : ''}.{broadcastResult.tip}
                    </p>
                  )}
                  {broadcastResult && !broadcastResult.ok && (
                    <p style={{ fontSize: 13, color: '#dc2626', margin: '12px 0 0' }}>{broadcastResult.error}</p>
                  )}
                </div>
              )}
            </>
          )}

          {!showEditor && (
            <div style={{ ...DS.card, textAlign: 'center', padding: '48px 24px', color: '#9ca3af', marginTop: 12 }}>
              <p style={{ fontSize: 24, margin: '0 0 12px', lineHeight: 1 }}>&#9993;</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>Select a template or create a new one</p>
              <p style={{ fontSize: 13, margin: 0 }}>Templates are saved and reusable. The preview updates as you type.</p>
            </div>
          )}
        </div>

        {/* RIGHT: live preview */}
        {showEditor && (
          <PreviewStage
            draft={draft}
            store={store}
          />
        )}
      </div>

      {/* Responsive CSS */}
      <style>{`
        .etpl-sgrid {
          grid-template-columns: minmax(0, 430px) minmax(0, 1fr);
        }
        @media (max-width: 980px) {
          .etpl-sgrid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
