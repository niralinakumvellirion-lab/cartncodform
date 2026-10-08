'use client';
import { MAX_LEN } from './lib';

const DS = {
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
  inputError: { borderColor: '#dc2626' },
  errorMsg: { fontSize: 11, color: '#dc2626', marginTop: 3 },
};

function Field({ label, hint, error, children, span2 }) {
  return (
    <div style={{ marginBottom: 12, gridColumn: span2 ? '1 / -1' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label style={DS.label}>{label}</label>
        {hint && <span style={{ fontSize: 11, color: '#9ca3af' }}>{hint}</span>}
      </div>
      {children}
      {error && <p style={DS.errorMsg}>{error}</p>}
    </div>
  );
}

function fieldError(saveError, fieldName) {
  if (!saveError) return null;
  if (typeof saveError === 'string') return null;
  if (saveError.field === fieldName) return saveError.error;
  return null;
}

function inputStyle(saveError, fieldName) {
  return fieldError(saveError, fieldName) ? { ...DS.input, ...DS.inputError } : DS.input;
}

export default function WordsCard({ draft, setDraftField, saveError, bare, showName, isNew }) {
  const inner = (
    <>
      {!bare && (
        <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>
          Words
        </p>
      )}

      {showName && (
        <Field label="Template name" error={fieldError(saveError, 'name')}>
          <input
            style={inputStyle(saveError, 'name')}
            value={draft.name}
            maxLength={MAX_LEN.name}
            onChange={e => setDraftField('name', e.target.value)}
            placeholder="e.g. Diwali 2026 sale"
          />
        </Field>
      )}

      <div className="etpl-words-grid">
        <Field label="Subject line" hint={`${draft.subject.length}/${MAX_LEN.subject}`} error={fieldError(saveError, 'subject')}>
          <input
            style={inputStyle(saveError, 'subject')}
            value={draft.subject}
            maxLength={MAX_LEN.subject}
            onChange={e => setDraftField('subject', e.target.value)}
            placeholder="e.g. Big Diwali sale is here — get 20% off"
          />
        </Field>

        <Field label="Eyebrow (above headline, optional)" hint={`${draft.eyebrow.length}/${MAX_LEN.eyebrow}`} error={fieldError(saveError, 'eyebrow')}>
          <input
            style={inputStyle(saveError, 'eyebrow')}
            value={draft.eyebrow}
            maxLength={MAX_LEN.eyebrow}
            onChange={e => setDraftField('eyebrow', e.target.value)}
            placeholder="e.g. Special offer"
          />
        </Field>

        <Field label="Headline" hint={`${draft.headline.length}/${MAX_LEN.headline}`} error={fieldError(saveError, 'headline')}>
          <input
            style={inputStyle(saveError, 'headline')}
            value={draft.headline}
            maxLength={MAX_LEN.headline}
            onChange={e => setDraftField('headline', e.target.value)}
            placeholder="e.g. Your biggest sale of the year"
          />
        </Field>

        <Field label="Offer line (optional)" hint={`${(draft.offerText || '').length}/${MAX_LEN.offerText}`} error={fieldError(saveError, 'offerText')}>
          <input
            style={inputStyle(saveError, 'offerText')}
            value={draft.offerText || ''}
            maxLength={MAX_LEN.offerText}
            onChange={e => setDraftField('offerText', e.target.value)}
            placeholder="e.g. 20% OFF"
          />
        </Field>

        <Field label="Body" hint={`${draft.body.length}/${MAX_LEN.body}`} error={fieldError(saveError, 'body')} span2>
          <textarea
            style={fieldError(saveError, 'body') ? { ...DS.textarea, ...DS.inputError } : DS.textarea}
            value={draft.body}
            maxLength={MAX_LEN.body}
            onChange={e => setDraftField('body', e.target.value)}
            placeholder="Write your email body. Plain text; line breaks become paragraphs."
          />
        </Field>

        <Field label="CTA label (optional)" hint={`${(draft.ctaLabel || '').length}/${MAX_LEN.ctaLabel}`} error={fieldError(saveError, 'ctaLabel')}>
          <input
            style={inputStyle(saveError, 'ctaLabel')}
            value={draft.ctaLabel || ''}
            maxLength={MAX_LEN.ctaLabel}
            onChange={e => setDraftField('ctaLabel', e.target.value)}
            placeholder="Shop now"
          />
        </Field>

        <Field label="CTA URL (optional)" error={fieldError(saveError, 'ctaUrl')}>
          <input
            style={inputStyle(saveError, 'ctaUrl')}
            value={draft.ctaUrl || ''}
            onChange={e => setDraftField('ctaUrl', e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field label="Footer note (optional)" hint={`${(draft.note || '').length}/${MAX_LEN.note}`} error={fieldError(saveError, 'note')}>
          <input
            style={inputStyle(saveError, 'note')}
            value={draft.note || ''}
            maxLength={MAX_LEN.note}
            onChange={e => setDraftField('note', e.target.value)}
            placeholder="e.g. Valid through Oct 31 · One use per customer"
          />
        </Field>
      </div>
    </>
  );

  if (bare) return inner;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 12 }}>
      {inner}
    </div>
  );
}
