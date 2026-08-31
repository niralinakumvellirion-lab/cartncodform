import Link from 'next/link';

const features = [
  {
    title: 'Cart Recovery',
    body: 'Capture every abandoned cart from your Shopify store in real time via webhooks and follow up before the sale is lost.',
    icon: '🛒',
  },
  {
    title: 'COD Forms',
    body: 'Give customers a clean, public Cash-on-Delivery form. Orders land straight in your dashboard, ready to confirm.',
    icon: '📦',
  },
  {
    title: 'Multi-store Dashboard',
    body: 'Connect as many Shopify stores as you run and manage abandoned carts and COD orders from one place.',
    icon: '📊',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-xl font-bold tracking-tight text-gray-900">
          Cart<span className="text-brand">n</span>CodForm
        </span>
        <nav className="flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/dashboard" className="hover:text-gray-900">
            Dashboard
          </Link>
          <Link
            href="/install"
            className="rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-dark"
          >
            Connect Your Store
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Recover Lost Carts &amp; Accept COD Orders
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          CartnCodForm plugs into your Shopify stores, tracks every abandoned cart,
          and gives your customers a frictionless Cash-on-Delivery form — all managed
          from a single multi-store dashboard.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/install"
            className="rounded-lg bg-brand px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-dark"
          >
            Connect Your Store
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
          >
            View Dashboard
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Everything you need to stop losing sales
          </h2>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
              >
                <div className="text-3xl">{f.icon}</div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold text-gray-900">Ready to recover revenue?</h2>
        <p className="mt-4 text-gray-600">
          Install the app on your Shopify store in under a minute.
        </p>
        <Link
          href="/install"
          className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 text-base font-semibold text-white hover:bg-brand-dark"
        >
          Connect Your Store
        </Link>
      </section>

      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} CartnCodForm
      </footer>
    </main>
  );
}
