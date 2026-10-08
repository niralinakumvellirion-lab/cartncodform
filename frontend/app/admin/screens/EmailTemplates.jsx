'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import { GOOGLE_FONTS_HREF, SEGMENTS, EMPTY_DRAFT, draftFromTemplate, STICKY_TOP } from './emailStudio/lib';
import { LAYOUT_INFO } from './emailStudio/layoutWires';
import { COLORS } from './emailStudio/palette';
import TemplatePicker from './emailStudio/TemplatePicker';
import PhotoCard from './emailStudio/PhotoCard';
import LayoutCard from './emailStudio/LayoutCard';
import ColourCard from './emailStudio/ColourCard';
import FontCard from './emailStudio/FontCard';
import WordsCard from './emailStudio/WordsCard';
import PreviewStage from './emailStudio/PreviewStage';
import _eng from '../lib/emailEngine';

const { PRESETS: ENGINE_PRESETS, DEFAULT_LAYOUT_BY_TYPE, renderEmail, designFromTemplate, FONT_ORDER, FONTS } = _eng || {};

const STARTER_TYPES = ['special_offer', 'festival', 'normal'];

// ── Design tokens ─────────────────────────────────────────────────────────────
const DS = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  btnPrimary: {
    background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 9,
    padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 9,
    padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  btnDanger: {
    background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 9,
    padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};

// ── Numbered card wrapper ──────────────────────────────────────────────────────
function NumberedCard({ n, title, children }) {
  return (
    <div style={{
      background: 'var(--card, #fff)',
      border: '1px solid var(--line, #e5e5ea)',
      borderRadius: 14,
      padding: '16px 20px',
    }}>
      <p style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 13, fontWeight: 700, color: 'var(--ink, #16161a)', margin: '0 0 14px',
      }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--acc, #4f46e5)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, flexShrink: 0,
        }}>{n}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function EmailTemplatesScreen() {
  const searchParams = useSearchParams();
  const shopParam     = searchParams ? (searchParams.get('shop')     || '') : '';
  const templateParam = searchParams ? (searchParams.get('template') || '') : '';
  const focusParam    = searchParams ? (searchParams.get('focus')    || '') : '';

  const photoCardRef        = useRef(null);
  const templateAutoSelected = useRef(false);

  // Store brand data
  const [store, setStore] = useState({ shopName: '', logoUrl: null, primaryColor: null, shopDomain: '' });

  // Template list
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [seeding, setSeeding]       = useState(false);
  const [seedError, setSeedError]   = useState('');
  const [seedCount, setSeedCount]   = useState(0);
  const [justSeeded, setJustSeeded] = useState(false);
  const [seedDismissed, setSeedDismissed] = useState(false);

  // Selection
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew]           = useState(false);
  const [filter, setFilter]         = useState('all');
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // Draft + dirty
  const [draft, setDraft]         = useState(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft] = useState(null);
  const dirty = useMemo(() =>
    !!savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft),
  [draft, savedDraft]);

  const [pendingNav, setPendingNav] = useState(null);

  // Save
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk]     = useState(false);

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
  const [broadcastSegment, setBroadcastSegment]       = useState('everyone');
  const [broadcastCount, setBroadcastCount]           = useState(null);
  const [broadcastCountLoading, setBroadcastCountLoading] = useState(false);
  const [broadcastConfirm, setBroadcastConfirm]       = useState(false);
  const [broadcasting, setBroadcasting]               = useState(false);
  const [broadcastResult, setBroadcastResult]         = useState(null);

  // Preview controls
  const [deviceView, setDeviceView] = useState('desktop'); // 'desktop' | 'mobile'
  const [viewMode, setViewMode]     = useState('fit');      // 'fit' | 'actual'

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Load Google Fonts once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector(`link[href*="fonts.googleapis.com"][data-etpl]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_HREF;
    link.setAttribute('data-etpl', '1');
    document.head.appendChild(link);
  }, []);

  // Load brand data
  useEffect(() => {
    const shop = shopParam || (typeof window !== 'undefined' && window.shopify?.config?.shop) || '';
    if (!shop) return;
    setStore(s => ({ ...s, shopDomain: shop }));
    apiGet(`/api/profiles/${encodeURIComponent(shop)}/settings`)
      .then(data => {
        setStore({ shopName: data.shopName || '', logoUrl: data.logoUrl || null, primaryColor: data.primaryColor || null, shopDomain: shop });
      })
      .catch(() => {});
  }, [shopParam]);

  useEffect(() => { loadTemplates(); }, []);

  // Auto-select from URL param
  useEffect(() => {
    if (!templateParam || templateAutoSelected.current || templates.length === 0) return;
    const match = templates.find(t => t._id === templateParam);
    if (match) {
      templateAutoSelected.current = true;
      _doSelectTemplate(match);
      if (focusParam === 'photo') {
        setTimeout(() => {
          const el = photoCardRef.current;
          if (!el) return;
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  // ── Data helpers ──────────────────────────────────────────────────────────────

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
      if (data.seeded && added > 0) { setSeedCount(added); setJustSeeded(true); }
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
    if (dirty || uploading) { setPendingNav(() => action); }
    else { action(); }
  }

  function executeNav() {
    if (pendingNav) { pendingNav(); setPendingNav(null); }
  }

  function _doSelectTemplate(t) {
    const d = draftFromTemplate(t);
    setSelectedId(t._id); setIsNew(false);
    setDraft(d); setSavedDraft(d);
    setSaveError(null); setSaveOk(false); setConfirmDel(false);
    setSendResult(null); setSendRecipient(''); setProductTitle('');
    setGenError(''); setGenNotice(''); setGenConfirm(false);
    setBroadcastSegment('everyone'); setBroadcastCount(null);
    setBroadcastCountLoading(false); setBroadcastConfirm(false); setBroadcastResult(null);
    setPhotoError(''); setPhotoCardKey(k => k + 1);
  }

  function _doStartNew() {
    setSelectedId(null); setIsNew(true);
    setDraft(EMPTY_DRAFT); setSavedDraft(EMPTY_DRAFT);
    setSaveError(null); setSaveOk(false); setConfirmDel(false);
    setSendResult(null); setSendRecipient(''); setProductTitle('');
    setGenError(''); setGenNotice(''); setGenConfirm(false);
    setBroadcastSegment('everyone'); setBroadcastCount(null);
    setBroadcastCountLoading(false); setBroadcastConfirm(false); setBroadcastResult(null);
    setPhotoError(''); setPhotoCardKey(k => k + 1);
  }

  function selectTemplate(t) { tryNavigate(() => _doSelectTemplate(t)); }
  function startNew()         { tryNavigate(_doStartNew); }

  async function saveTemplate() {
    if (saving || uploading) return;
    setSaving(true); setSaveError(null); setSaveOk(false);
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
        setSelectedId(saved._id); setIsNew(false);
      }
      const d = draftFromTemplate(saved);
      setDraft(d); setSavedDraft(d); setSaveOk(true);
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
      setSelectedId(null); setIsNew(false);
      setDraft(EMPTY_DRAFT); setSavedDraft(null); setConfirmDel(false);
      setPhotoCardKey(k => k + 1);
    } catch (e) {
      setSaveError(e.message); setConfirmDel(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePhotoUpload(dataUrl, _file, clientErr) {
    if (clientErr) { setPhotoError(clientErr); return; }
    if (!dataUrl) return;
    setUploading(true); setPhotoError('');
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
    setGenError(''); setGenNotice('');
    if (draft.subject.trim() || draft.body.trim()) { setGenConfirm(true); }
    else { runGenerate(); }
  }

  async function runGenerate() {
    setGenConfirm(false);
    if (generating) return;
    setGenerating(true); setGenError(''); setGenNotice('');
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
    setSending(true); setSendResult(null);
    try {
      const isEmail = recipient.includes('@');
      const data = await apiSend(`/api/email-templates/${selectedId}/send`, 'POST',
        isEmail ? { email: recipient } : { profileId: recipient }
      );
      const tip = data.warnings && data.warnings.includes('no_photo') ? ' Tip: this email has no offer photo.' : '';
      setSendResult({ ok: true, id: data.id, tip });
    } catch (e) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setSending(false);
    }
  }

  async function sendBroadcast() {
    if (!selectedId || broadcasting) return;
    setBroadcasting(true); setBroadcastConfirm(false); setBroadcastResult(null);
    try {
      const data = await apiSend(`/api/email-templates/${selectedId}/broadcast`, 'POST', { segment: broadcastSegment });
      const tip = data.warnings && data.warnings.includes('no_photo') ? ' Tip: this email has no offer photo.' : '';
      setBroadcastResult({ ok: true, sent: data.sent, failed: data.failed, tip });
    } catch (e) {
      setBroadcastResult({ ok: false, error: e.message });
    } finally {
      setBroadcasting(false);
    }
  }

  function applyPreset(k) {
    if (!ENGINE_PRESETS || !ENGINE_PRESETS[k]) return;
    const p = ENGINE_PRESETS[k];
    setDraftField('layout', p.layout);
    setDraftField('color',  p.color);
    setDraftField('hFont',  p.hFont);
    setDraftField('bFont',  p.bFont);
    setDraftField('radius', p.radius);
    setDraftField('pageBg', null);
    setDraftField('cardBg', null);
  }

  function surpriseMe() {
    const layouts   = (LAYOUT_INFO || []).map(l => l.k);
    const allFonts  = FONT_ORDER || [];
    const bodyFonts = allFonts.filter(k => !(FONTS && FONTS[k] && FONTS[k].head));
    const radii     = ['round', 'sharp'];
    if (!layouts.length || !allFonts.length) return;
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    setDraftField('layout', pick(layouts));
    setDraftField('color',  pick(COLORS));
    setDraftField('hFont',  pick(allFonts));
    setDraftField('bFont',  pick(bodyFonts.length ? bodyFonts : allFonts));
    setDraftField('radius', pick(radii));
    setDraftField('pageBg', null);
    setDraftField('cardBg', null);
  }

  const showEditor     = isNew || !!selectedId;
  const sendDisabled   = dirty || uploading;
  const sendDisabledHint = sendDisabled ? 'Save your changes first' : '';
  const noPhoto        = showEditor && !draft.imageUrl;

  // ── Header JSX ────────────────────────────────────────────────────────────────

  const headerJSX = (
    <div style={{
      background: '#fff', borderBottom: '1px solid var(--line, #e5e5ea)',
      padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', rowGap: 6 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
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
            compact={true}
          />
        </div>
        {dirty && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#fffbeb', color: '#b45309', border: '1.5px solid #fde68a', flexShrink: 0 }}>
            Unsaved changes
          </span>
        )}
        {saveOk && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f0fdf4', color: '#166534', border: '1.5px solid #bbf7d0', flexShrink: 0 }}>
            Saved
          </span>
        )}
        {showEditor && (
          <button
            style={{ ...DS.btnPrimary, opacity: saving || uploading ? 0.7 : 1, flexShrink: 0 }}
            onClick={saveTemplate}
            disabled={saving || uploading}
          >
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        )}
        {dirty && (
          <button
            style={{ ...DS.btnSecondary, flexShrink: 0 }}
            onClick={() => {
              if (savedDraft) { setDraft(savedDraft); setSaveError(null); setSaveOk(false); }
              else _doStartNew();
            }}
          >
            Discard
          </button>
        )}
      </div>
      {pendingNav && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#92400e', flex: 1 }}>Unsaved changes — discard and continue?</span>
          <button style={{ ...DS.btnDanger, fontSize: 12, padding: '4px 10px' }} onClick={executeNav}>Discard</button>
          <button style={{ ...DS.btnSecondary, fontSize: 12, padding: '4px 10px' }} onClick={() => setPendingNav(null)}>Keep editing</button>
        </div>
      )}
      {saveError && (
        <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>
          {typeof saveError === 'string' ? saveError : saveError.error}
        </p>
      )}
      {(loading || seeding) && (
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
          {seeding ? 'Setting up starter templates…' : 'Loading…'}
        </p>
      )}
      {!loading && !seeding && seedError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 0' }}>
          <p style={{ fontSize: 12, color: '#dc2626', margin: 0, flex: 1 }}>{seedError}</p>
          <button style={{ ...DS.btnSecondary, fontSize: 11, padding: '3px 8px' }} onClick={() => runSeed(templates.length)}>Try again</button>
        </div>
      )}
      {!loading && loadError && <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>{loadError}</p>}
      {justSeeded && !seedDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '5px 10px', margin: '6px 0 0' }}>
          <p style={{ fontSize: 12, color: '#166534', margin: 0, flex: 1 }}>
            {seedCount} starter template{seedCount !== 1 ? 's' : ''} ready. Edit them or send as-is.
          </p>
          <button style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#166534', padding: 0 }} onClick={() => setSeedDismissed(true)} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );

  // ── Preset chips row (always visible, below header) ───────────────────────────

  const presetChipsJSX = ENGINE_PRESETS && (
    <div style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      padding: '8px 12px 4px',
      background: '#fff',
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Quick styles:</span>
      {Object.keys(ENGINE_PRESETS).map(k => {
        const p = ENGINE_PRESETS[k];
        return (
          <button key={k} type="button" onClick={() => applyPreset(k)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
            background: '#f3f4f6', color: '#374151', border: '1.5px solid var(--line, #e5e5ea)', outline: 'none',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            {p.name}
          </button>
        );
      })}
      <button type="button" onClick={surpriseMe} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
        background: 'var(--acc, #4f46e5)', color: '#fff', border: 'none', outline: 'none',
      }}>
        Surprise me
      </button>
    </div>
  );

  // ── Panel: 6 numbered cards ───────────────────────────────────────────────────

  const panelJSX = !showEditor ? (
    <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9ca3af' }}>
      <p style={{ fontSize: 22, margin: '0 0 10px', lineHeight: 1 }}>✉</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>Select a template or create a new one</p>
      <p style={{ fontSize: 12, margin: 0 }}>The preview updates as you type.</p>
    </div>
  ) : (
    <>
      {/* Card 1 — Offer photo */}
      <NumberedCard n="1" title="Offer photo">
        <div ref={photoCardRef}>
          <PhotoCard
            key={photoCardKey}
            draft={draft}
            uploading={uploading}
            photoError={photoError}
            onUpload={handlePhotoUpload}
            onRemove={handlePhotoRemove}
            onClearError={() => setPhotoError('')}
            bare
          />
        </div>
      </NumberedCard>

      {/* Card 2 — Layout */}
      <NumberedCard n="2" title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Layout
          {LAYOUT_INFO && LAYOUT_INFO.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: 'var(--accsoft, #eef0ff)', color: 'var(--acc, #4f46e5)',
              border: '1px solid var(--acc, #4f46e5)',
            }}>
              {LAYOUT_INFO.length} styles
            </span>
          )}
        </span>
      }>
        <LayoutCard draft={draft} setDraftField={setDraftField} saveError={saveError} bare />
      </NumberedCard>

      {/* Card 3 — Colours */}
      <NumberedCard n="3" title="Colours">
        <ColourCard draft={draft} setDraftField={setDraftField} store={store} saveError={saveError} bare />
      </NumberedCard>

      {/* Card 4 — Fonts */}
      <NumberedCard n="4" title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Fonts
          {FONT_ORDER && FONT_ORDER.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: 'var(--accsoft, #eef0ff)', color: 'var(--acc, #4f46e5)',
              border: '1px solid var(--acc, #4f46e5)',
            }}>
              {FONT_ORDER.length} families
            </span>
          )}
        </span>
      }>
        <FontCard draft={draft} setDraftField={setDraftField} saveError={saveError} bare />
      </NumberedCard>

      {/* Card 5 — Words (includes Write with AI) */}
      <NumberedCard n="5" title="Words">
        {isNew && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['special_offer', 'festival', 'normal'].map(key => (
                <button key={key} onClick={() => setDraftField('type', key)} style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                  background: draft.type === key ? '#4f46e5' : '#f3f4f6',
                  color: draft.type === key ? '#fff' : '#374151',
                  border: draft.type === key ? 'none' : '1px solid #e5e7eb',
                }}>
                  {{ special_offer: 'Special offer', festival: 'Festival', normal: 'Normal' }[key]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Write with AI — moved from Send tab */}
        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Write with AI</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Product (optional)</label>
              <input
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827' }}
                value={productTitle}
                onChange={e => { setProductTitle(e.target.value); setGenError(''); setGenNotice(''); setGenConfirm(false); }}
                placeholder="e.g. Banarasi Silk Kurti"
              />
            </div>
            <button
              style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: generating ? 0.7 : 1, flexShrink: 0 }}
              onClick={handleGenerateClick}
              disabled={generating}
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {genConfirm && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>Replace subject, body, and offer line?</span>
              <button style={{ ...DS.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={runGenerate}>Replace</button>
              <button style={{ ...DS.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={() => setGenConfirm(false)}>Cancel</button>
            </div>
          )}
          {genNotice && <p style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '5px 8px', margin: '8px 0 0' }}>{genNotice}</p>}
          {genError  && <p style={{ fontSize: 11, color: '#dc2626', margin: '8px 0 0' }}>{genError}</p>}
        </div>

        <WordsCard draft={draft} setDraftField={setDraftField} saveError={saveError} bare showName isNew={isNew} />
      </NumberedCard>

      {/* Card 6 — Send */}
      <NumberedCard n="6" title="Send">
        {selectedId && (
          <div style={{ marginBottom: 14, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Send test</p>
            {sendDisabledHint && <p style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '4px 8px', margin: '0 0 8px' }}>{sendDisabledHint}</p>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Customer email</label>
                <input
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827' }}
                  type="email"
                  value={sendRecipient}
                  onChange={e => { setSendRecipient(e.target.value); setSendResult(null); }}
                  placeholder="customer@example.com"
                  disabled={sendDisabled}
                />
              </div>
              <button
                style={{ ...DS.btnPrimary, opacity: sendDisabled ? 0.5 : 1, flexShrink: 0 }}
                onClick={sendEmail}
                disabled={sendDisabled || sending || !sendRecipient.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {sendResult?.ok && <p style={{ fontSize: 12, color: '#16a34a', margin: '8px 0 0' }}>Sent! ID: {sendResult.id}{sendResult.tip}</p>}
            {sendResult && !sendResult.ok && <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>{sendResult.error}</p>}
          </div>
        )}

        {selectedId && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Send to customers</p>
            {sendDisabledHint && <p style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '4px 8px', margin: '0 0 8px' }}>{sendDisabledHint}</p>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Segment</label>
                <select
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827', cursor: 'pointer' }}
                  value={broadcastSegment}
                  disabled={sendDisabled}
                  onChange={e => { setBroadcastSegment(e.target.value); setBroadcastConfirm(false); setBroadcastResult(null); }}
                >
                  {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>
            {broadcastCountLoading && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>Counting…</p>}
            {!broadcastCountLoading && broadcastCount === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>No customers match this segment.</p>}
            {!broadcastCountLoading && broadcastCount !== null && broadcastCount > 0 && broadcastCount <= 90 && (
              <p style={{ fontSize: 12, color: '#374151', margin: '0 0 8px' }}>{broadcastCount} customers will receive this.</p>
            )}
            {!broadcastCountLoading && broadcastCount !== null && broadcastCount > 90 && (
              <p style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '5px 8px', margin: '0 0 8px' }}>
                Free plan sends up to ~90 at once. {broadcastCount} match — narrow the segment.
              </p>
            )}
            {!broadcastConfirm ? (
              <button
                style={{ ...DS.btnPrimary, opacity: sendDisabled ? 0.5 : 1 }}
                disabled={sendDisabled || broadcasting || broadcastCountLoading || broadcastCount === null || broadcastCount === 0 || broadcastCount > 90}
                onClick={() => setBroadcastConfirm(true)}
              >
                Send to {broadcastCount ?? '…'} customers
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#374151' }}>Send to {broadcastCount} customers? This can&apos;t be undone.</span>
                <button style={DS.btnPrimary} onClick={sendBroadcast} disabled={broadcasting}>{broadcasting ? 'Sending…' : 'Confirm send'}</button>
                <button style={DS.btnSecondary} onClick={() => setBroadcastConfirm(false)}>Cancel</button>
              </div>
            )}
            {broadcastResult?.ok && (
              <p style={{ fontSize: 12, color: '#16a34a', margin: '8px 0 0' }}>
                Sent to {broadcastResult.sent}{broadcastResult.failed > 0 ? `, failed ${broadcastResult.failed}` : ''}.{broadcastResult.tip}
              </p>
            )}
            {broadcastResult && !broadcastResult.ok && (
              <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>{broadcastResult.error}</p>
            )}
          </div>
        )}

        {!selectedId && (
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Save your template first to send a test or broadcast.</p>
        )}
      </NumberedCard>
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="es-root"
      style={{ fontFamily: DS.fontFamily }}
    >
      {/* head area */}
      <div className="es-head">
        {headerJSX}
        {presetChipsJSX}
      </div>

      {/* stage area — sticky preview */}
      <div className="es-stage">
        <PreviewStage
          draft={showEditor ? draft : null}
          store={store}
          deviceView={deviceView}
          onDeviceViewChange={setDeviceView}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          noPhoto={noPhoto}
        />
      </div>

      {/* panel area — stacked numbered cards */}
      <div className="es-panel">
        {panelJSX}
      </div>

      {/* Scoped CSS — tokens on wrapper only, not :root */}
      <style dangerouslySetInnerHTML={{ __html: `
        .es-root {
          --bg: #f3f3f6;
          --card: #fff;
          --line: #e5e5ea;
          --ink: #16161a;
          --mut: #6a6a76;
          --acc: #4f46e5;
          --accsoft: #eef0ff;
          --field: #fff;
          --stage: #e8e8ee;
          display: grid;
          grid-template-columns: minmax(0,430px) minmax(0,1fr);
          grid-template-areas: "head stage" "panel stage";
          grid-template-rows: auto 1fr;
          gap: 16px 22px;
          align-items: start;
          padding: 16px;
          background: var(--bg);
          box-sizing: border-box;
          min-height: 520px;
        }
        .es-head {
          grid-area: head;
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
        }
        .es-panel {
          grid-area: panel;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-bottom: 24px;
        }
        .es-stage {
          grid-area: stage;
          position: sticky;
          top: ${STICKY_TOP}px;
          background: var(--stage);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 14px;
          max-height: calc(100vh - 24px);
          overflow: hidden;
          align-self: start;
        }
        @media (max-width: 980px) {
          .es-root {
            grid-template-columns: minmax(0,1fr);
            grid-template-areas: "head" "stage" "panel";
          }
          .es-stage {
            position: static;
            max-height: 400px;
          }
        }
        .etpl-words-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
        @media (min-width: 481px) { .etpl-words-grid { grid-template-columns: 1fr 1fr; column-gap: 16px; } }
      ` }} />
    </div>
  );
}
