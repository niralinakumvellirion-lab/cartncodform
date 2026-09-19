'use client';

import { useState, useEffect, useRef } from 'react';
import { apiGet } from '../../../lib/api';

const DEBOUNCE_MS = 300;

// Where a queued/sent notification's click-through should land. Controlled
// entirely by the parent via `value`/`onChange` — this component holds no
// copy of targetType/productId/productHandle/productTitle in its own
// state, only transient UI state (search term, fetched lists, loading/
// error flags), so it can't drift from whatever the parent is about to
// save.
export function ProductPicker({ shop, value, onChange }) {
  const targetType = value?.targetType || 'home';
  const selectedProductId = value?.productId || '';
  const selectedProductTitle = value?.productTitle || '';

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const hasLoadedRef = useRef(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef(null);

  function loadProducts() {
    setProductsLoading(true);
    setProductsError('');
    apiGet(`/api/stores/${shop}/products`)
      .then((data) => {
        setProducts(Array.isArray(data) ? data : []);
        hasLoadedRef.current = true;
      })
      .catch((err) => {
        setProductsError(err.message || "Couldn't load products — try again");
      })
      .finally(() => setProductsLoading(false));
  }

  // Load the full product list once, the first time this picker is
  // switched into "Specific product" mode — not on mount, so opening an
  // editor that stays on "Entire store" never hits the products endpoint.
  useEffect(() => {
    if (targetType === 'product' && !hasLoadedRef.current && !productsLoading) {
      loadProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, shop]);

  function runSearch(term) {
    setSearchLoading(true);
    setSearchError('');
    apiGet(`/api/stores/${shop}/products?q=${encodeURIComponent(term)}`)
      .then((data) => setSearchResults(Array.isArray(data) ? data : []))
      .catch((err) => setSearchError(err.message || "Couldn't load products — try again"))
      .finally(() => setSearchLoading(false));
  }

  // Debounced search — 300ms after the user stops typing, and only when
  // there's a non-empty term; clearing the box drops back to the
  // already-loaded full list rather than re-fetching it.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError('');
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(term), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, shop]);

  const isSearching = searchTerm.trim().length > 0;
  const displayList = isSearching ? (searchResults || []) : products;
  const listLoading = isSearching ? searchLoading : productsLoading;
  const listError = isSearching ? searchError : productsError;

  function selectHome() {
    onChange({ targetType: 'home', productId: '', productHandle: '', productTitle: '' });
  }
  function selectProductTab() {
    // Preserve any product already picked in this editing session — just
    // flips which mode is showing, doesn't discard the selection.
    onChange({
      targetType: 'product',
      productId: value?.productId || '',
      productHandle: value?.productHandle || '',
      productTitle: value?.productTitle || '',
    });
  }
  function pickProduct(p) {
    onChange({
      targetType: 'product',
      productId: String(p.id),
      productHandle: p.handle,
      productTitle: p.title,
    });
  }
  function clearSelection() {
    onChange({ targetType: 'product', productId: '', productHandle: '', productTitle: '' });
  }
  function retry() {
    if (isSearching) {
      runSearch(searchTerm.trim());
    } else {
      loadProducts();
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151',
                      display: 'block', marginBottom: 6 }}>
        Where should tapping the notification go?
      </label>

      {/* Segmented control — same pill pattern as the Queue screen's
          Calendar/Planning List tabs. */}
      <div style={{
        display: 'inline-flex', gap: 4, padding: 4,
        background: '#f3f4f6', borderRadius: 10, marginBottom: 10,
      }}>
        <button
          type="button"
          onClick={selectHome}
          style={{
            padding: '7px 16px', minHeight: 32, fontSize: 12, fontWeight: 600,
            border: 'none', borderRadius: 7, cursor: 'pointer',
            background: targetType === 'home' ? '#4f46e5' : 'transparent',
            color: targetType === 'home' ? '#fff' : '#6b7280',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          Entire store
        </button>
        <button
          type="button"
          onClick={selectProductTab}
          style={{
            padding: '7px 16px', minHeight: 32, fontSize: 12, fontWeight: 600,
            border: 'none', borderRadius: 7, cursor: 'pointer',
            background: targetType === 'product' ? '#4f46e5' : 'transparent',
            color: targetType === 'product' ? '#fff' : '#6b7280',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          Specific product
        </button>
      </div>

      {targetType === 'home' ? (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          Tapping the notification opens your storefront homepage.
        </div>
      ) : (
        <div>
          {/* Selected-product summary chip */}
          {selectedProductId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', marginBottom: 8,
              background: '#eef2ff', border: '1px solid #c7d2fe',
              borderRadius: 8, fontSize: 12, color: '#4338ca', fontWeight: 600,
            }}>
              <span style={{
                flex: 1, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {selectedProductTitle || 'Selected product'}
              </span>
              <button
                type="button"
                onClick={clearSelection}
                aria-label="Clear selected product"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#4338ca', fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search products…"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              border: '1px solid #e5e7eb', fontSize: 13,
              boxSizing: 'border-box', marginBottom: 8,
            }}
          />

          {/* List */}
          <div style={{
            maxHeight: 240, overflowY: 'auto',
            border: '1px solid #e5e7eb', borderRadius: 8,
          }}>
            {listLoading ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
                Loading...
              </div>
            ) : listError ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
                  Couldn't load products — try again
                </div>
                <button
                  type="button"
                  onClick={retry}
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                    border: '1px solid #e5e7eb', borderRadius: 8,
                    background: '#fff', color: '#374151', cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : displayList.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
                {isSearching ? 'No products match that search.' : 'No products found.'}
              </div>
            ) : (
              displayList.map((p, idx) => {
                const isSelected = String(p.id) === String(selectedProductId);
                const isLast = idx === displayList.length - 1;
                return (
                  <div
                    key={p.id}
                    onClick={() => pickProduct(p)}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#f5f3ff' : '#fff'; }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', cursor: 'pointer',
                      borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
                      background: isSelected ? '#f5f3ff' : '#fff',
                      transition: 'background 0.12s',
                    }}
                  >
                    {p.imageUrl && (
                      <img
                        src={p.imageUrl}
                        alt=""
                        style={{
                          width: 36, height: 36, borderRadius: 6,
                          objectFit: 'cover', flexShrink: 0,
                        }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div style={{
                      flex: 1, minWidth: 0, fontSize: 14, color: '#111827',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {p.title}
                    </div>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: isSelected ? 'none' : '1.5px solid #d1d5db',
                      background: isSelected ? '#4f46e5' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && (
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
