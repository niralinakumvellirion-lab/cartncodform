'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

// ── Design tokens (matches other admin screens) ─────────────────────────────
const DS = {
  page: {
    maxWidth: 1100,
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
  textarea: {
    width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db',
    borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#111827',
    resize: 'vertical', minHeight: 110,
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
  primary: '#4f46e5',
};

const TYPE_LABELS = { special_offer: 'Special offer', festival: 'Festival', normal: 'Normal' };

const TYPE_COLORS = {
  special_offer: { bg: '#fef3c7', text: '#b45309' },
  festival:      { bg: '#f3e8ff', text: '#7c3aed' },
  normal:        { bg: '#f0fdf4', text: '#16a34a' },
};

const EMPTY_FORM = { type: 'normal', name: '', subject: '', body: '', imageUrl: '', ctaLabel: '', ctaUrl: '' };

function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || { bg: '#f3f4f6', text: '#374151' };
  return (
    <span style={{
      background: c.bg, color: c.text, borderRadius: 6,
      padding: '2px 8px', fontSize: 11, fontWeight: 700,
    }}>
      {TYPE_LABELS[type] || type}
    </span>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={DS.pageTitle}>{title}</h1>
          {subtitle && <p style={DS.pageSubtitle}>{subtitle}</p>}
        </div>
        {action && <div style={{ flexShrink: 0, marginTop: 2 }}>{action}</div>}
      </div>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
                    borderRadius: 2, marginTop: 12, width: 48 }} />
    </div>
  );
}

function SegmentedType({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {Object.entries(TYPE_LABELS).map(([key, label]) => {
        const active = value === key;
        return (
          <button key={key} onClick={() => onChange(key)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
            background: active ? '#4f46e5' : '#f3f4f6',
            color: active ? '#fff' : '#374151',
            border: active ? 'none' : '1px solid #e5e7eb',
          }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={DS.label}>{label}</label>
      {children}
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function EmailTemplatesScreen() {
  const [templates, setTemplates]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState('');

  const [filter, setFilter]           = useState('all');
  const [selectedId, setSelectedId]   = useState(null);
  const [isNew, setIsNew]             = useState(false);

  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');
  const [saveOk, setSaveOk]           = useState(false);

  const [confirmDel, setConfirmDel]   = useState(false);
  const [deleting, setDeleting]       = useState(false);

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewMode, setPreviewMode] = useState('desktop');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [sendRecipient, setSendRecipient] = useState('');
  const [sending, setSending]             = useState(false);
  const [sendResult, setSendResult]       = useState(null);

  const [generating, setGenerating]       = useState(false);
  const [genError, setGenError]           = useState('');
  const [genNotice, setGenNotice]         = useState('');
  const [productTitle, setProductTitle]   = useState('');
  const [genConfirm, setGenConfirm]       = useState(false);

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiGet('/api/email-templates');
      setTemplates(data.templates || []);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function selectTemplate(t) {
    setSelectedId(t._id);
    setIsNew(false);
    setForm({
      type: t.type,
      name: t.name,
      subject: t.subject,
      body: t.body,
      imageUrl: t.imageUrl || '',
      ctaLabel: t.ctaLabel || '',
      ctaUrl: t.ctaUrl || '',
    });
    setSaveError('');
    setSaveOk(false);
    setConfirmDel(false);
    setSendResult(null);
    setSendRecipient('');
    setPreviewHtml('');
    setProductTitle('');
    setGenError('');
    setGenNotice('');
    setGenConfirm(false);
    // Auto-load preview for existing template
    fetchPreview(t._id);
  }

  function startNew() {
    setSelectedId(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setSaveError('');
    setSaveOk(false);
    setConfirmDel(false);
    setPreviewHtml('');
    setSendResult(null);
    setSendRecipient('');
    setProductTitle('');
    setGenError('');
    setGenNotice('');
    setGenConfirm(false);
  }

  function patch(field) {
    return (e) => {
      setForm(f => ({ ...f, [field]: e.target.value }));
      setSaveOk(false);
    };
  }

  async function fetchPreview(id) {
    if (!id) return;
    setPreviewLoading(true);
    try {
      const data = await apiGet(`/api/email-templates/${id}/preview`);
      setPreviewHtml(data.html || '');
    } catch {
      // non-fatal: preview unavailable
    } finally {
      setPreviewLoading(false);
    }
  }

  async function saveTemplate() {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    setSaveOk(false);
    try {
      let saved;
      if (selectedId) {
        const res = await apiSend(`/api/email-templates/${selectedId}`, 'PATCH', form);
        saved = res.template;
        setTemplates(ts => ts.map(t => (t._id === selectedId ? saved : t)));
      } else {
        const res = await apiSend('/api/email-templates', 'POST', form);
        saved = res.template;
        setTemplates(ts => [saved, ...ts]);
        setSelectedId(saved._id);
        setIsNew(false);
      }
      setSaveOk(true);
      // Preview refreshes on save
      await fetchPreview(saved._id);
    } catch (e) {
      setSaveError(e.message);
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
      setForm(EMPTY_FORM);
      setPreviewHtml('');
      setConfirmDel(false);
    } catch (e) {
      setSaveError(e.message);
      setConfirmDel(false);
    } finally {
      setDeleting(false);
    }
  }

  function handleGenerateClick() {
    setGenError('');
    setGenNotice('');
    if (form.subject.trim() || form.body.trim()) {
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
      const payload = { type: form.type };
      if (productTitle.trim()) payload.productTitle = productTitle.trim();
      const data = await apiSend('/api/email-templates/generate', 'POST', payload);
      setForm(f => ({ ...f, subject: data.subject || f.subject, body: data.body || f.body }));
      setSaveOk(false);
      if (data.fallback) {
        setGenNotice('AI unavailable — starter draft filled in.');
      }
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
      // Send email if it looks like one; fall back to profileId for raw IDs.
      const isEmail = recipient.includes('@');
      const data = await apiSend(`/api/email-templates/${selectedId}/send`, 'POST',
        isEmail ? { email: recipient } : { profileId: recipient }
      );
      setSendResult({ ok: true, id: data.id });
    } catch (e) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setSending(false);
    }
  }

  const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'special_offer', label: 'Special offer' },
    { key: 'festival', label: 'Festival' },
    { key: 'normal', label: 'Normal' },
  ];

  const filtered = filter === 'all' ? templates : templates.filter(t => t.type === filter);
  const showEditor = isNew || !!selectedId;

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={DS.page}>
      <PageHeader
        title="Email templates"
        subtitle="Save and send branded email templates to your customers."
        action={
          <button style={DS.btnPrimary} onClick={startNew}>
            + New template
          </button>
        }
      />

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
            background: filter === tab.key ? '#4f46e5' : '#f3f4f6',
            color: filter === tab.key ? '#fff' : '#374151',
            border: filter === tab.key ? 'none' : '1px solid #e5e7eb',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="etpl-layout" style={{
        display: 'flex', gap: 20, alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}>
        {/* LEFT: list */}
        <div style={{ flex: '0 0 280px', minWidth: 0, width: '100%', maxWidth: 320 }}>
          <div style={{ ...DS.card, padding: '12px 0' }}>
            {loading && (
              <p style={{ padding: '20px 20px', fontSize: 13, color: '#9ca3af' }}>Loading…</p>
            )}
            {!loading && loadError && (
              <p style={{ padding: '20px 20px', fontSize: 13, color: '#dc2626' }}>{loadError}</p>
            )}
            {!loading && !loadError && filtered.length === 0 && (
              <p style={{ padding: '20px 20px', fontSize: 13, color: '#9ca3af' }}>
                {templates.length === 0 ? 'No templates yet. Create one →' : 'No templates match this filter.'}
              </p>
            )}
            {!loading && filtered.map(t => (
              <button
                key={t._id}
                onClick={() => selectTemplate(t)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 20px', background: selectedId === t._id ? '#eef2ff' : 'transparent',
                  border: 'none', borderLeft: selectedId === t._id ? '3px solid #4f46e5' : '3px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                  {t.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TypeBadge type={t.type} />
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(t.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: editor + preview */}
        {showEditor ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Editor card */}
            <div style={{ ...DS.card, marginBottom: 16 }}>
              <p style={DS.sectionLabel}>{isNew ? 'New template' : 'Edit template'}</p>

              <Field label="Type">
                <SegmentedType value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} />
              </Field>

              {/* AI Generate */}
              <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f5f3ff', borderRadius: 10, border: '1px solid #e0e7ff' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Generate with AI
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
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
                    {generating ? 'Generating…' : 'Generate with AI'}
                  </button>
                </div>
                {genConfirm && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>This will replace your current subject and body.</span>
                    <button style={{ ...DS.btnSecondary, padding: '5px 12px', fontSize: 12 }} onClick={runGenerate}>Replace</button>
                    <button style={{ ...DS.btnSecondary, padding: '5px 12px', fontSize: 12 }} onClick={() => setGenConfirm(false)}>Cancel</button>
                  </div>
                )}
                {genNotice && (
                  <p style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '6px 10px', margin: '10px 0 0' }}>
                    {genNotice}
                  </p>
                )}
                {genError && (
                  <p style={{ fontSize: 12, color: '#dc2626', margin: '10px 0 0' }}>{genError}</p>
                )}
              </div>

              <Field label="Name (internal label)">
                <input style={DS.input} value={form.name} onChange={patch('name')} placeholder="e.g. Diwali 2026 sale" />
              </Field>

              <Field label="Subject">
                <input style={DS.input} value={form.subject} onChange={patch('subject')} placeholder="Email subject line" />
              </Field>

              <Field label="Body">
                <textarea style={DS.textarea} value={form.body} onChange={patch('body')} placeholder="Write your email body. Plain text; line breaks become <br> in the final email." />
              </Field>

              <Field label="Product image URL (optional)">
                <input style={DS.input} value={form.imageUrl} onChange={patch('imageUrl')} placeholder="https://..." />
              </Field>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Field label="CTA button label (optional)">
                    <input style={DS.input} value={form.ctaLabel} onChange={patch('ctaLabel')} placeholder="Shop now" />
                  </Field>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Field label="CTA URL (optional)">
                    <input style={DS.input} value={form.ctaUrl} onChange={patch('ctaUrl')} placeholder="https://..." />
                  </Field>
                </div>
              </div>

              {saveError && (
                <p style={{ fontSize: 13, color: '#dc2626', margin: '8px 0 0' }}>{saveError}</p>
              )}
              {saveOk && (
                <p style={{ fontSize: 13, color: '#16a34a', margin: '8px 0 0' }}>Saved. Preview updated below.</p>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <button style={DS.btnPrimary} onClick={saveTemplate} disabled={saving}>
                  {saving ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
                </button>

                {selectedId && !confirmDel && (
                  <button style={DS.btnDanger} onClick={() => setConfirmDel(true)}>
                    Delete
                  </button>
                )}
                {confirmDel && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>Delete this template?</span>
                    <button style={{ ...DS.btnDanger, padding: '6px 12px' }}
                      onClick={deleteTemplate} disabled={deleting}>
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button style={DS.btnSecondary} onClick={() => setConfirmDel(false)}>Cancel</button>
                  </span>
                )}
              </div>
            </div>

            {/* Preview card */}
            <div style={{ ...DS.card, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ ...DS.sectionLabel, marginBottom: 0 }}>Preview</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['desktop', 'mobile'].map(m => (
                    <button key={m} onClick={() => setPreviewMode(m)} style={{
                      padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                      background: previewMode === m ? '#4f46e5' : '#f3f4f6',
                      color: previewMode === m ? '#fff' : '#374151',
                      border: previewMode === m ? 'none' : '1px solid #e5e7eb',
                      textTransform: 'capitalize',
                    }}>{m}</button>
                  ))}
                </div>
              </div>

              {isNew && !previewHtml && (
                <p style={{ fontSize: 13, color: '#9ca3af' }}>Save the template to see a live preview.</p>
              )}
              {!isNew && previewLoading && (
                <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading preview…</p>
              )}
              {previewHtml && (
                <div style={{
                  overflowX: 'auto', background: '#f3f4f6', borderRadius: 10, padding: 12,
                }}>
                  <div style={{
                    width: previewMode === 'desktop' ? 600 : 380,
                    margin: '0 auto',
                    transition: 'width 0.2s ease',
                  }}>
                    <iframe
                      sandbox=""
                      srcDoc={previewHtml}
                      title="Email preview"
                      style={{
                        width: '100%',
                        height: 520,
                        border: 'none',
                        borderRadius: 8,
                        display: 'block',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Send test card — only for saved templates */}
            {selectedId && (
              <div style={DS.card}>
                <p style={DS.sectionLabel}>Send test</p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
                  Enter the customer's email address to send this template.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={DS.label}>Customer email address</label>
                    <input
                      style={DS.input}
                      type="email"
                      value={sendRecipient}
                      onChange={e => { setSendRecipient(e.target.value); setSendResult(null); }}
                      placeholder="customer@example.com"
                    />
                  </div>
                  <button style={DS.btnPrimary} onClick={sendEmail} disabled={sending || !sendRecipient.trim()}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {sendResult?.ok && (
                  <p style={{ fontSize: 13, color: '#16a34a', margin: '10px 0 0' }}>
                    Email sent! Resend ID: {sendResult.id}
                  </p>
                )}
                {sendResult && !sendResult.ok && (
                  <p style={{ fontSize: 13, color: '#dc2626', margin: '10px 0 0' }}>
                    {sendResult.error}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          /* No template selected */
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...DS.card, textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
              <p style={{ fontSize: 32, margin: '0 0 12px' }}>✉</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
                Select a template or create a new one
              </p>
              <p style={{ fontSize: 13, margin: 0 }}>
                Templates are saved and reusable. Preview shows the real rendered email.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Responsive stacking: both columns go full-width below 640px */}
      <style>{`
        @media (max-width: 640px) {
          .etpl-layout > * { flex: 0 0 100% !important; max-width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
