'use client';

import React from 'react';
import { addProductBlockUrl } from '../../../lib/themeEditor';

/**
 * "Show it on your store" card for a theme app block: three steps and a button that opens the theme editor
 * on a product page with the block already added. Props: shop, handle (block file name), blockName (as it
 * appears in the theme editor), place (where to drag it), whenLive (when shoppers see it).
 */
export default function ThemeBlockSetup({ shop, handle, blockName, place, whenLive }) {
  const href = addProductBlockUrl(shop, handle);
  return (
    <section style={ui.card} aria-labelledby={`ccf-setup-${handle}`}>
      <div style={ui.head}>
        <div>
          <h2 id={`ccf-setup-${handle}`} style={ui.title}>Show it on your store</h2>
          <p style={ui.sub}>Add the <strong>{blockName}</strong> block to your product page once. It takes a minute.</p>
        </div>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" style={ui.btn}>
            Add to product page ↗
          </a>
        ) : null}
      </div>
      <ol style={ui.steps}>
        <li>Click <strong>Add to product page</strong>. Your theme editor opens on a product page with the block added.</li>
        <li>Drag the <strong>{blockName}</strong> block {place}.</li>
        <li>Click <strong>Save</strong> in the theme editor.</li>
      </ol>
      <p style={ui.note}>
        {whenLive} Already added it? You will find it under <strong>Apps</strong> in the product page sections.
      </p>
    </section>
  );
}

const ui = {
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px', margin: '12px 0 16px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 },
  sub: { fontSize: 13, color: '#4B5563', margin: '4px 0 0' },
  btn: { display: 'inline-block', fontSize: 13, fontWeight: 600, color: '#fff', background: '#111827', borderRadius: 8, padding: '8px 14px', textDecoration: 'none', whiteSpace: 'nowrap' },
  steps: { margin: '12px 0 8px', paddingLeft: 20, fontSize: 13, color: '#374151', lineHeight: 1.8 },
  note: { fontSize: 12, color: '#6B7280', margin: 0 },
};
