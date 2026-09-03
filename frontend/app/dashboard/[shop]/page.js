'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import { onForegroundMessage } from '../../../lib/firebase';
import PushNotificationSetup from '../../../components/PushNotificationSetup';

function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

// Strip spaces, plus signs and dashes so the number is wa.me-friendly.
function cleanPhone(phone) {
  return String(phone || '').replace(/[\s+\-]/g, '');
}

function WhatsAppButton({ phone, message }) {
  const href = `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ backgroundColor: '#25D366' }}
      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
    >
      💬 WhatsApp
    </a>
  );
}

function SendPushButton({ shop, cartValue, cartItems, productImageUrl, sessionId, itemTitle, productId }) {
  const [state, setState] = useState('idle'); // idle | sending | sent | error

  async function send() {
    setState('sending');
    try {
      await apiSend('/api/push/send-customer', 'POST', {
        shopDomain: shop,
        title: 'You left items in your cart! 🛒',
        body: itemTitle
          ? `You left "${itemTitle}" in your cart!`
          : `Your cart has items worth ₹${cartValue}. Complete your order now!`,
        url: `https://${shop}`,
        imageUrl: productImageUrl || cartItems?.[0]?.imageUrl || null,
        cartToken: sessionId || null,
        productId: productId || null,
      });
      setState('sent');
    } catch (err) {
      console.error('[push] send-customer failed:', err);
      setState('error');
    }
  }

  const label =
    state === 'sending'
      ? 'Sending…'
      : state === 'sent'
      ? 'Push sent!'
      : state === 'error'
      ? 'Failed'
      : '🔔 Push';

  return (
    <button
      onClick={send}
      disabled={state === 'sending'}
      style={{ backgroundColor: '#7c3aed' }}
      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    abandoned: 'bg-red-100 text-red-700',
    recovered: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-200 text-gray-600',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function CustomerAnalytics({ shop, customer, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) return;

    const sessionId = customer.sessionId;
    if (!sessionId) {
      setLoading(false);
      return;
    }

    // Step 1: resolve ccfSessionId from cartToken (sessionId)
    apiGet(`/api/events/${encodeURIComponent(shop)}/resolve/${encodeURIComponent(sessionId)}`)
      .then(function(data) {
        const ccfSessionId = data.ccfSessionId;
        if (!ccfSessionId) {
          // No subscription found for this cart — try direct sessionId lookup
          return apiGet(`/api/events/${encodeURIComponent(shop)}/customer/${encodeURIComponent(sessionId)}`);
        }
        // Step 2: fetch events by stable ccfSessionId
        return apiGet(`/api/events/${encodeURIComponent(shop)}/ccfsession/${encodeURIComponent(ccfSessionId)}`);
      })
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [shop, customer]);

  const iconFor = (type) => ({
    page_view: '👁️',
    product_view: '🛍️',
    collection_view: '📂',
    search: '🔍',
    cart_view: '🛒',
    add_to_cart: '➕',
    remove_from_cart: '➖',
    cart_update: '✏️',
    reached_checkout: '💳',
    page_exit: '🚪',
  }[type] || '📍');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">Customer Journey</h2>
          <button onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No events tracked yet.
            <p className="text-xs mt-2">Events are tracked when a
            subscribed customer browses the store.</p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {events.map((e, i) => (
              <div key={i}
                className="flex gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
                <span className="text-xl">{iconFor(e.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 capitalize">
                      {e.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(e.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{e.path}</p>
                  {e.meta && (
                    <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                      {e.meta.title && <p>{e.meta.title}</p>}
                      {e.meta.query && <p>Search: "{e.meta.query}"</p>}
                      {e.meta.dwellSeconds !== undefined && (
                        <p>{e.meta.dwellSeconds}s on page · {e.meta.scrollDepth || 0}% scrolled</p>
                      )}
                      {e.meta.cartValue && <p>Cart: ₹{e.meta.cartValue}</p>}
                      {e.meta.itemCount && <p>{e.meta.itemCount} items</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StoreView() {
  const params = useParams();
  const router = useRouter();
  const shop = decodeURIComponent(params.shop || '');

  const [tab, setTab] = useState('abandoned');
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const [analyticsCustomer, setAnalyticsCustomer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, o] = await Promise.all([
        apiGet(`/api/stores/${encodeURIComponent(shop)}/customers`),
        apiGet(`/api/stores/${encodeURIComponent(shop)}/orders`),
      ]);
      setCustomers(c);
      setOrders(o);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      console.log('[push] Foreground message:', payload);
      const title = payload.notification?.title || 'CartnCodForm';
      const body = payload.notification?.body || 'New notification';

      // Show browser notification even when tab is focused
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      }
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  async function handleDisconnect() {
    const ok = window.confirm(
      'Are you sure you want to disconnect this store? All data will be deleted.'
    );
    if (!ok) return;

    setDisconnecting(true);
    setError('');
    try {
      await apiSend(`/api/stores/${encodeURIComponent(shop)}`, 'DELETE');
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
      setDisconnecting(false);
    }
  }

  async function updateOrderStatus(id, status) {
    // optimistic update
    setOrders((prev) => prev.map((o) => (o._id === id ? { ...o, status } : o)));
    try {
      await apiSend(`/api/cod/order/${id}`, 'PATCH', { status });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  const tabButton = (key, label, count) => (
    <button
      onClick={() => setTab(key)}
      className={`flex-1 border-b-2 px-1 pb-3 text-center text-sm font-medium transition sm:flex-none sm:text-left ${
        tab === key
          ? 'border-brand text-brand'
          : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {label} <span className="ml-1 text-xs text-gray-400">({count})</span>
    </button>
  );

  return (
    <>
      {analyticsCustomer && (
        <CustomerAnalytics
          shop={shop}
          customer={analyticsCustomer}
          onClose={() => setAnalyticsCustomer(null)}
        />
      )}
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl break-all">{shop}</h1>
          <p className="mt-1 text-sm text-gray-500">Abandoned carts &amp; COD orders</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:py-1.5"
          >
            Refresh
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 sm:w-auto sm:py-1.5"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect Store'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <PushNotificationSetup shopDomain={shop} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-gray-200 sm:gap-6">
        {tabButton('abandoned', 'Abandoned Carts', customers.length)}
        {tabButton('cod', 'COD Orders', orders.length)}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">Couldn’t load store data</p>
          <p className="mt-1 break-words">{error}</p>
          <button
            onClick={load}
            className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div className="mt-8 flex items-center gap-2 text-sm text-gray-500">
          <span className="h-3 w-3 animate-pulse rounded-full bg-gray-400" />
          Loading store data…
        </div>
      )}

      {!loading && tab === 'abandoned' && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Customer Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Cart Items</th>
                <th className="px-4 py-3">Cart Value</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No abandoned carts yet.
                  </td>
                </tr>
              )}
              {customers.map((c) => {
                const anon = !c.email && !c.phone;
                const itemCount = Array.isArray(c.cartItems)
                  ? c.cartItems.reduce((s, i) => s + (i.quantity || 1), 0)
                  : 0;
                return (
                  <tr
                    key={c._id}
                    onClick={() => setAnalyticsCustomer(c)}
                    className="cursor-pointer hover:bg-blue-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {anon ? (
                        <span className="italic text-gray-400">Anonymous</span>
                      ) : (
                        c.email || <span className="italic text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.phone || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {Array.isArray(c.cartItems) && c.cartItems.length > 0 ? (
                          c.cartItems.map((item, idx) => (
                            <div key={idx}
                              className="flex items-center justify-between gap-2 py-0.5">
                              <span className="text-xs text-gray-600 truncate flex-1 mr-2">
                                {item.title} x{item.quantity || 1}
                              </span>
                              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                <SendPushButton
                                  shop={shop}
                                  cartValue={c.cartValue}
                                  cartItems={c.cartItems}
                                  productImageUrl={item.imageUrl || c.productImageUrl}
                                  sessionId={c.sessionId}
                                  itemTitle={item.title}
                                  productId={item.productId || null}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <span className="text-gray-400">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatMoney(c.cartValue)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.phone && (
                          <div onClick={(e) => e.stopPropagation()}>
                          <WhatsAppButton
                            phone={c.phone}
                            message={
                              `Hi! We noticed you left some items in your cart.\n` +
                              `Items: ${
                                Array.isArray(c.cartItems) && c.cartItems.length > 0
                                  ? c.cartItems
                                      .map((i) => `${i.title} x${i.quantity || 1}`)
                                      .join(', ')
                                  : '-'
                              }\n` +
                              `Cart Value: ${formatMoney(c.cartValue)}\n` +
                              `Please complete your order. We'd love to help!`
                            }
                          />
                        </div>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'cod' && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No COD orders yet.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o._id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{o.name}</td>
                  <td className="px-4 py-3">{o.phone}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="block truncate" title={`${o.address}, ${o.city} ${o.pincode}`}>
                      {o.address}
                      {o.city ? `, ${o.city}` : ''} {o.pincode}
                    </span>
                  </td>
                  <td className="px-4 py-3">{o.productName || '—'}</td>
                  <td className="px-4 py-3">{formatMoney(o.productPrice)}</td>
                  <td className="px-4 py-3">{o.quantity}</td>
                  <td className="px-4 py-3">
                    <select
                      value={o.status}
                      onChange={(e) => updateOrderStatus(o._id, e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-brand focus:outline-none"
                    >
                      <option value="pending">pending</option>
                      <option value="confirmed">confirmed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <WhatsAppButton
                      phone={o.phone}
                      message={
                        `Hi ${o.name}! Your COD order has been received.\n` +
                        `Product: ${o.productName || '-'}\n` +
                        `Amount: ₹${formatMoney(o.productPrice)}\n` +
                        `Quantity: ${o.quantity}\n` +
                        `We will process your order soon!`
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}
