'use client';

import { Suspense, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { apiSend } from '../../../lib/api';

export default function CodFormPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      }
    >
      <CodForm />
    </Suspense>
  );
}

function CodForm() {
  const params = useParams();
  const searchParams = useSearchParams();
  const shop = decodeURIComponent(params.shop || '');

  const productName = searchParams.get('productName') || '';
  const price = searchParams.get('price') || '';

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
    quantity: 1,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
      setError('Name, phone and address are required.');
      return;
    }

    setSubmitting(true);
    try {
      await apiSend('/api/cod/order', 'POST', {
        shopDomain: shop,
        name: form.name,
        phone: form.phone,
        address: form.address,
        city: form.city,
        pincode: form.pincode,
        productName,
        productPrice: Number(price) || 0,
        quantity: Number(form.quantity) || 1,
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">✅</div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">Order placed!</h1>
          <p className="mt-2 text-sm text-gray-600">
            Thanks {form.name.split(' ')[0]}. Your Cash-on-Delivery order has been received and is
            pending confirmation. We&apos;ll call you on {form.phone} shortly.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Cash on Delivery Order</h1>
        <p className="mt-1 text-xs text-gray-400">{shop}</p>

        {/* Product summary */}
        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">{productName || 'Product'}</p>
          <p className="mt-1 text-sm text-gray-600">
            Price: <span className="font-medium">{price ? Number(price).toFixed(2) : '—'}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Full Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Phone Number" required>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Full Address" required>
            <textarea
              rows={3}
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <input
                type="text"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Pincode">
              <input
                type="text"
                value={form.pincode}
                onChange={(e) => update('pincode', e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <Field label="Quantity">
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => update('quantity', e.target.value)}
              className="input"
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Place COD Order'}
          </button>
        </form>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 1px #4f46e5;
        }
      `}</style>
    </main>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
