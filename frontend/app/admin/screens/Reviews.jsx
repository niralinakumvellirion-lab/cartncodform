'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import ThemeBlockSetup from '../components/ThemeBlockSetup';

// ── Options shown on this screen (the backend validates the same limits) ─────────────────
const WHO_OPTIONS = [
  { value: 'verified', title: 'Verified buyers only', info: 'Only customers who bought this product can write a review.' },
  { value: 'logged_in', title: 'Logged-in users', info: 'Any customer who is signed in to their store account can write a review.' },
  { value: 'anyone', title: 'Anyone', info: 'Every visitor can write a review, no account or purchase needed.' },
];
const PER_PAGE_OPTIONS = [5, 10, 15, 20, 25, 50];
const MAX_PHOTO_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const FILE_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const FILE_TYPES = [
  { value: 'jpeg', label: 'JPEG', hint: '.jpg, .jpeg' },
  { value: 'png', label: 'PNG', hint: '.png' },
  { value: 'gif', label: 'GIF', hint: '.gif' },
  { value: 'webp', label: 'WEBP', hint: '.webp' },
];

const DEFAULTS = {
  whoCanReview: 'verified',
  verifiedBadge: true,
  starRating: true,
  starRequired: true,
  reviewsPerPage: 10,
  photos: { enabled: true, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg', 'png', 'webp'] },
  helpfulVotes: true,
  requireApproval: true,
};

const ACCENT = '#4F46E5';

function normalize(raw) {
  const s = raw || {};
  const p = s.photos || {};
  return {
    whoCanReview: s.whoCanReview || DEFAULTS.whoCanReview,
    verifiedBadge: typeof s.verifiedBadge === 'boolean' ? s.verifiedBadge : DEFAULTS.verifiedBadge,
    starRating: typeof s.starRating === 'boolean' ? s.starRating : DEFAULTS.starRating,
    starRequired: typeof s.starRequired === 'boolean' ? s.starRequired : DEFAULTS.starRequired,
    reviewsPerPage: Number.isInteger(s.reviewsPerPage) ? s.reviewsPerPage : DEFAULTS.reviewsPerPage,
    photos: {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULTS.photos.enabled,
      maxPhotos: Number.isInteger(p.maxPhotos) ? p.maxPhotos : DEFAULTS.photos.maxPhotos,
      maxFileSizeMb: Number.isInteger(p.maxFileSizeMb) ? p.maxFileSizeMb : DEFAULTS.photos.maxFileSizeMb,
      allowedTypes: Array.isArray(p.allowedTypes) ? [...p.allowedTypes] : [...DEFAULTS.photos.allowedTypes],
    },
    helpfulVotes: typeof s.helpfulVotes === 'boolean' ? s.helpfulVotes : DEFAULTS.helpfulVotes,
    requireApproval: typeof s.requireApproval === 'boolean' ? s.requireApproval : DEFAULTS.requireApproval,
  };
}

// ── Small building blocks ───────────────────────────────────────────────────────────────

function Switch({ checked, onChange, label, disabled }) {
  return (
    <span style={ui.switchWrap}>
      <span style={{ ...ui.switchText, color: checked && !disabled ? '#065F46' : '#6B7280' }} aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          ...ui.switchTrack,
          background: checked ? ACCENT : '#D1D5DB',
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ ...ui.switchKnob, transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
    </span>
  );
}

function Row({ title, info, control, last, dimmed, htmlFor }) {
  return (
    <div style={{ ...ui.row, borderBottom: last ? 'none' : '1px solid #F3F4F6', opacity: dimmed ? 0.6 : 1 }}>
      <div style={ui.rowText}>
        {htmlFor ? (
          <label htmlFor={htmlFor} style={ui.rowTitle}>{title}</label>
        ) : (
          <div style={ui.rowTitle}>{title}</div>
        )}
        <div style={ui.rowInfo}>{info}</div>
      </div>
      <div style={ui.rowControl}>{control}</div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <section style={ui.card} aria-label={title}>
      <div style={ui.cardHead}>
        <h2 style={ui.cardTitle}>{title}</h2>
        {subtitle ? <p style={ui.cardSub}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Select({ id, value, onChange, options, suffix, disabled, label }) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...ui.select, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}{suffix || ''}</option>
      ))}
    </select>
  );
}

function Stars({ count = 5, size = 16 }) {
  return (
    <span aria-label={`${count} out of 5 stars`} style={{ color: '#F59E0B', fontSize: size, letterSpacing: 1 }}>
      {'★'.repeat(count)}{'☆'.repeat(5 - count)}
    </span>
  );
}

// ── Live preview of what a review looks like with the current settings ───────────────────
function Preview({ s }) {
  const photoCount = s.photos.enabled ? Math.min(s.photos.maxPhotos, 3) : 0;
  const who = WHO_OPTIONS.find((o) => o.value === s.whoCanReview);
  return (
    <aside style={ui.preview} aria-label="Preview">
      <div style={ui.previewTitle}>Preview</div>
      <div style={ui.previewBody}>
        {s.starRating ? (
          <div style={ui.previewSummary}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#111827' }}>4.8</span>
            <Stars count={5} size={18} />
            <span style={{ fontSize: 12, color: '#6B7280' }}>128 reviews</span>
          </div>
        ) : (
          <div style={{ ...ui.previewSummary, fontSize: 13, color: '#374151', fontWeight: 600 }}>128 reviews</div>
        )}

        <div style={ui.sampleReview}>
          <div style={ui.sampleTop}>
            <span style={ui.avatar}>P</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Priya S.</div>
              {s.verifiedBadge ? <span style={ui.verified}>✓ Verified owner</span> : null}
            </div>
            {s.starRating ? <div style={{ marginLeft: 'auto' }}><Stars count={5} size={14} /></div> : null}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginTop: 8 }}>Beautiful fabric and fit</div>
          <p style={{ fontSize: 12.5, color: '#4B5563', margin: '4px 0 8px', lineHeight: 1.5 }}>
            Arrived on time and looks exactly like the photos. Will order again.
          </p>
          {photoCount > 0 ? (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }} aria-label={`${photoCount} photos`}>
              {Array.from({ length: photoCount }).map((_, i) => (
                <span key={i} style={ui.thumb} aria-hidden="true">▣</span>
              ))}
            </div>
          ) : null}
          {s.helpfulVotes ? (
            <button type="button" style={ui.helpfulBtn} tabIndex={-1} aria-label="Helpful (sample)">👍 Helpful (12)</button>
          ) : null}
        </div>

        <div style={ui.previewNotes}>
          <div>{who ? who.info : ''}</div>
          <div>{s.starRating ? (s.starRequired ? 'A star rating is required.' : 'A star rating is optional.') : 'Star ratings are off.'}</div>
          <div>Shows {s.reviewsPerPage} reviews per page.</div>
          <div>{s.requireApproval ? 'New reviews wait for your approval.' : 'New reviews appear right away.'}</div>
        </div>
      </div>
    </aside>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────────────────

export default function Reviews({ shop }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveField, setSaveField] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 960);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!shop) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    apiGet(`/api/reviews/${encodeURIComponent(shop)}/settings`)
      .then((data) => {
        if (cancelled) return;
        const s = normalize(data && data.settings);
        setSaved(s);
        setDraft(s);
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Could not load your review settings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shop]);

  const dirty = useMemo(
    () => !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved]
  );

  function patch(changes) {
    setJustSaved(false);
    setSaveError('');
    setSaveField('');
    setDraft((d) => {
      const next = { ...d, ...changes };
      if (next.starRating === false) next.starRequired = false;
      return next;
    });
  }

  function patchPhotos(changes) {
    setJustSaved(false);
    setSaveError('');
    setSaveField('');
    setDraft((d) => ({ ...d, photos: { ...d.photos, ...changes } }));
  }

  function toggleType(type) {
    const has = draft.photos.allowedTypes.includes(type);
    const next = has ? draft.photos.allowedTypes.filter((t) => t !== type) : [...draft.photos.allowedTypes, type];
    patchPhotos({ allowedTypes: next });
  }

  async function save() {
    setSaving(true);
    setSaveError('');
    setSaveField('');
    try {
      const data = await apiSend(`/api/reviews/${encodeURIComponent(shop)}/settings`, 'PUT', { settings: draft });
      const s = normalize(data && data.settings);
      setSaved(s);
      setDraft(s);
      setJustSaved(true);
    } catch (err) {
      setSaveError(err.message || 'Could not save. Please try again.');
      setSaveField(err.field || '');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDraft(saved);
    setSaveError('');
    setSaveField('');
  }

  if (loading) {
    return (
      <div style={ui.page}>
        <h1 style={ui.title}>Product reviews</h1>
        <div style={ui.skeleton} role="status" aria-label="Loading review settings">Loading your review settings…</div>
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <div style={ui.page}>
        <h1 style={ui.title}>Product reviews</h1>
        <div style={ui.errorBox} role="alert">{loadError || 'Could not load your review settings.'}</div>
      </div>
    );
  }

  const photosOff = !draft.photos.enabled;
  const typesError = saveField === 'photos.allowedTypes';

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div>
          <h1 style={ui.title}>Product reviews</h1>
          <p style={ui.subtitle}>Choose who can review your products and what a review can include.</p>
        </div>
      </div>

      <ThemeBlockSetup
        shop={shop}
        handle="product-reviews"
        blockName="Product reviews"
        place="below the product details"
        whenLive="These settings apply to every product that has the block."
      />

      <div style={{ ...ui.layout, gridTemplateColumns: wide ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)' }}>
        <div style={ui.column}>
          {/* 1 — who can leave reviews */}
          <Card title="Who can leave reviews" subtitle="Pick one. This applies to every product.">
            <div role="radiogroup" aria-label="Who can leave reviews">
              {WHO_OPTIONS.map((o, i) => {
                const id = `who-${o.value}`;
                return (
                  <Row
                    key={o.value}
                    htmlFor={id}
                    title={o.title}
                    info={o.info}
                    last={i === WHO_OPTIONS.length - 1}
                    control={(
                      <input
                        id={id}
                        type="radio"
                        name="whoCanReview"
                        value={o.value}
                        checked={draft.whoCanReview === o.value}
                        onChange={() => patch({ whoCanReview: o.value })}
                        style={ui.radio}
                      />
                    )}
                  />
                );
              })}
            </div>
          </Card>

          {/* 2, 3, 4, 5 — display and ratings */}
          <Card title="Ratings and display" subtitle="How reviews look and what customers must fill in.">
            <Row
              title="Show “Verified owner” badge"
              info="Adds a green badge next to reviews written by customers who bought the product."
              control={<Switch checked={draft.verifiedBadge} onChange={(v) => patch({ verifiedBadge: v })} label="Show verified owner badge" />}
            />
            <Row
              title="Enable star rating"
              info="Lets customers give 1 to 5 stars and shows the average on your product page."
              control={<Switch checked={draft.starRating} onChange={(v) => patch({ starRating: v })} label="Enable star rating" />}
            />
            <Row
              title="Star rating required"
              info={draft.starRating ? 'Customers must pick a star rating before they can submit.' : 'Turn on star rating first.'}
              dimmed={!draft.starRating}
              control={(
                <Switch
                  checked={draft.starRating && draft.starRequired}
                  disabled={!draft.starRating}
                  onChange={(v) => patch({ starRequired: v })}
                  label="Star rating required"
                />
              )}
            />
            <Row
              htmlFor="reviews-per-page"
              title="Reviews per page"
              info="How many reviews show before the “Load more” button."
              last
              control={(
                <Select
                  id="reviews-per-page"
                  label="Reviews per page"
                  value={draft.reviewsPerPage}
                  options={PER_PAGE_OPTIONS.includes(draft.reviewsPerPage) ? PER_PAGE_OPTIONS : [...PER_PAGE_OPTIONS, draft.reviewsPerPage].sort((a, b) => a - b)}
                  onChange={(v) => patch({ reviewsPerPage: v })}
                />
              )}
            />
          </Card>

          {/* 6 — photo reviews */}
          <Card title="Photo reviews" subtitle="Let customers add pictures of what they bought.">
            <Row
              title="Allow photos in reviews"
              info="Customers can attach photos when they write a review."
              last={false}
              control={<Switch checked={draft.photos.enabled} onChange={(v) => patchPhotos({ enabled: v })} label="Allow photos in reviews" />}
            />
            <div style={{ ...ui.sub, opacity: photosOff ? 0.55 : 1 }} aria-disabled={photosOff}>
              <Row
                htmlFor="max-photos"
                title="Max photos per review"
                info="The most photos one customer can add to a single review."
                control={(
                  <Select
                    id="max-photos"
                    label="Max photos per review"
                    value={draft.photos.maxPhotos}
                    options={MAX_PHOTO_OPTIONS}
                    disabled={photosOff}
                    onChange={(v) => patchPhotos({ maxPhotos: v })}
                  />
                )}
              />
              <Row
                htmlFor="max-file-size"
                title="Max file size"
                info="Photos larger than this are not accepted."
                control={(
                  <Select
                    id="max-file-size"
                    label="Max file size"
                    value={draft.photos.maxFileSizeMb}
                    options={FILE_SIZE_OPTIONS}
                    suffix=" MB"
                    disabled={photosOff}
                    onChange={(v) => patchPhotos({ maxFileSizeMb: v })}
                  />
                )}
              />
              <div style={{ ...ui.row, borderBottom: 'none', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ ...ui.rowText, flex: '1 1 180px' }}>
                  <div style={ui.rowTitle} id="file-types-label">Allowed file types</div>
                  <div style={ui.rowInfo}>Only these picture formats can be uploaded.</div>
                  {typesError ? <div style={ui.fieldError} role="alert">Choose at least one file type.</div> : null}
                </div>
                <div style={ui.typeList} role="group" aria-labelledby="file-types-label">
                  {FILE_TYPES.map((t) => {
                    const on = draft.photos.allowedTypes.includes(t.value);
                    return (
                      <label
                        key={t.value}
                        style={{
                          ...ui.typeChip,
                          borderColor: on ? ACCENT : '#E5E7EB',
                          background: on ? '#EEF2FF' : '#fff',
                          cursor: photosOff ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={photosOff}
                          onChange={() => toggleType(t.value)}
                          aria-label={`${t.label} files`}
                          style={{ accentColor: ACCENT }}
                        />
                        <span style={{ fontWeight: 700 }}>{t.label}</span>
                        <span style={{ color: '#6B7280', fontSize: 11 }}>{t.hint}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* 7 — helpful vote */}
          <Card title="Community" subtitle="Let shoppers help each other find the best reviews.">
            <Row
              title="Helpful vote"
              info="Shows a “Helpful” button so shoppers can vote for the reviews that helped them."
              last
              control={<Switch checked={draft.helpfulVotes} onChange={(v) => patch({ helpfulVotes: v })} label="Helpful vote" />}
            />
          </Card>

          {/* 8 — moderation */}
          <Card title="Moderation" subtitle="Decide whether new reviews need your OK before shoppers see them.">
            <Row
              title="Approve reviews first"
              info="New reviews wait in the Manage tab until you approve them. Turn off to publish them straight away."
              last
              control={<Switch checked={draft.requireApproval} onChange={(v) => patch({ requireApproval: v })} label="Approve reviews first" />}
            />
          </Card>

          {saveError && !typesError ? <div style={ui.errorBox} role="alert">{saveError}</div> : null}
        </div>

        {/* The column must stretch to the full height of the settings, or the sticky preview has no room to stay in view. */}
        {wide ? <div style={ui.previewCol}><div style={ui.previewSticky}><Preview s={draft} /></div></div> : <Preview s={draft} />}
      </div>

      {/* Save bar */}
      <div style={ui.saveBar} role="region" aria-label="Save changes">
        <div style={ui.saveMsg} role="status" aria-live="polite">
          {saving ? 'Saving…' : dirty ? 'You have unsaved changes.' : justSaved ? '✓ Saved' : 'No changes.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={discard} disabled={!dirty || saving} style={{ ...ui.btn, ...ui.btnGhost, opacity: !dirty || saving ? 0.5 : 1 }}>
            Discard
          </button>
          <button type="button" onClick={save} disabled={!dirty || saving} style={{ ...ui.btn, ...ui.btnPrimary, opacity: !dirty || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles (same look as the other admin screens) ───────────────────────────────────────
const ui = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '24px 20px 96px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#111827' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: '#111827' },
  subtitle: { margin: '4px 0 0', fontSize: 13.5, color: '#6B7280' },
  layout: { display: 'grid', gap: 20, alignItems: 'start' },
  column: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },
  previewCol: { alignSelf: 'stretch', minWidth: 0 },
  previewSticky: { position: 'sticky', top: 16 },
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' },
  cardHead: { padding: '16px 20px 12px', borderBottom: '1px solid #F3F4F6' },
  cardTitle: { fontSize: 15, fontWeight: 800, margin: 0, color: '#111827' },
  cardSub: { margin: '3px 0 0', fontSize: 12.5, color: '#6B7280' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '14px 20px' },
  rowText: { minWidth: 0, flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: 700, color: '#111827', display: 'block', cursor: 'default' },
  rowInfo: { fontSize: 12.5, color: '#6B7280', marginTop: 2, lineHeight: 1.45 },
  rowControl: { flexShrink: 0, display: 'flex', alignItems: 'center' },
  sub: { margin: '0 12px 12px 20px', border: '1px solid #F3F4F6', borderRadius: 10, background: '#FAFAFB' },
  radio: { width: 20, height: 20, accentColor: ACCENT, cursor: 'pointer' },
  select: { height: 36, minWidth: 96, padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13.5, color: '#111827', background: '#fff' },
  switchWrap: { display: 'inline-flex', alignItems: 'center', gap: 10 },
  switchText: { fontSize: 12, fontWeight: 700, minWidth: 22, textAlign: 'right', letterSpacing: '0.02em' },
  switchTrack: { position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', padding: 0, transition: 'background .15s' },
  switchKnob: { position: 'absolute', top: 2, left: 2, width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'transform .15s' },
  typeList: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, justifyItems: 'stretch', flex: '0 1 300px', minWidth: 0, maxWidth: '100%' },
  typeChip: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 10px', fontSize: 12.5, color: '#111827' },
  fieldError: { color: '#B91C1C', fontSize: 12, marginTop: 4, fontWeight: 600 },
  errorBox: { background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 13 },
  skeleton: { marginTop: 16, padding: 40, textAlign: 'center', color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12 },
  saveBar: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 24px', background: '#fff', borderTop: '1px solid #E5E7EB', boxShadow: '0 -2px 8px rgba(16,24,40,0.06)' },
  saveMsg: { fontSize: 13, color: '#374151', fontWeight: 600 },
  btn: { height: 36, padding: '0 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: '1px solid transparent' },
  btnPrimary: { background: ACCENT, color: '#fff' },
  btnGhost: { background: '#fff', color: '#374151', borderColor: '#D1D5DB' },
  preview: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' },
  previewTitle: { padding: '12px 16px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', borderBottom: '1px solid #F3F4F6' },
  previewBody: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  previewSummary: { display: 'flex', alignItems: 'center', gap: 8 },
  sampleReview: { border: '1px solid #E5E7EB', borderRadius: 10, padding: 12 },
  sampleTop: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 999, background: '#EEF2FF', color: ACCENT, fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  verified: { display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 999, padding: '1px 8px', marginTop: 2 },
  thumb: { width: 44, height: 44, borderRadius: 8, background: '#F3F4F6', color: '#9CA3AF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  helpfulBtn: { border: '1px solid #D1D5DB', background: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#374151' },
  previewNotes: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B7280', borderTop: '1px solid #F3F4F6', paddingTop: 12, lineHeight: 1.45 },
};
