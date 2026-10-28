import LegalLayout from '../components/landing/LegalLayout';

export const metadata = {
  title: 'Support — ShopiReachBoost AI',
  description: 'Get help with ShopiReachBoost AI. Contact support and find answers to common questions.',
};

export default function SupportPage() {
  return (
    <LegalLayout>
      <article>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-2">
          Support
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          ShopiReachBoost AI (operated by Nirali Nakum), India
        </p>

        <section className="mt-0 p-6 rounded-2xl border border-brand/20 bg-brand/5">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Contact Us</h2>
          <p className="text-sm text-gray-600 mb-3">
            Email is the best way to reach us. Describe your issue and include your Shopify store
            domain so we can look up your account.
          </p>
          <a
            href="mailto:niralinakum.vellirion@gmail.com"
            className="inline-flex items-center gap-2 bg-brand text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-dark transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            niralinakum.vellirion@gmail.com
          </a>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <Faq
              question="How do I install ShopiReachBoost AI on my Shopify store?"
              answer="Install the app from the Shopify App Store. After installation, you will be redirected to the app's admin dashboard inside your Shopify admin. Enable the app embed block from your Shopify theme editor (Online Store → Themes → Customize → App Embeds) to activate the storefront features."
            />
            <Faq
              question="How do web push notifications work?"
              answer="When a shopper visits your store, the app shows a soft opt-in prompt. If the shopper clicks 'Allow' in their browser's native permission dialog, their browser registers a push subscription token with our service. We use that token to send push notifications on your behalf. Shoppers who click 'Block' or dismiss the prompt are not subscribed and will not receive push notifications."
            />
            <Faq
              question="How does abandoned cart email recovery work?"
              answer="When a shopper provides their email address (at checkout, via a popup, or through the COD form) and then leaves without completing their purchase, the app schedules a recovery email. The email includes the shopper's cart contents and a link back to their cart. The email is sent via our email delivery provider, Resend."
            />
            <Faq
              question="What is the COD order form?"
              answer="The Cash on Delivery (COD) order form is an overlay on your storefront that lets shoppers place orders by entering their name, phone number, and delivery address, without going through the standard Shopify checkout. Orders placed through the form appear in your ShopiReachBoost AI admin dashboard."
            />
            <Faq
              question="How is AI-generated copy used?"
              answer="ShopiReachBoost AI uses an AI service to generate push notification and email message copy. We send store context (your shop name, the product title, and the cart value) to the AI service to generate relevant copy. Individual shopper names, email addresses, and phone numbers are not sent to the AI service. Generated copy is cached and reused across similar sends."
            />
            <Faq
              question="How can a shopper request deletion of their data?"
              answer="Shoppers should contact the merchant (the store owner) directly to request data deletion. The merchant can then submit a deletion request through Shopify's admin tools. When Shopify sends us the deletion webhook, we delete or anonymize all personal data associated with that shopper. For more information, see our Privacy Policy."
            />
            <Faq
              question="How do I disconnect or uninstall the app?"
              answer="Uninstall the app from your Shopify admin under Settings → Apps. To request deletion of all data associated with your store, email us at niralinakum.vellirion@gmail.com after uninstalling."
            />
          </div>
        </section>

        <section className="mt-12 pt-8 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            For information about how we collect, use, and delete data, see our{' '}
            <a href="/privacy" className="text-brand hover:underline font-medium">Privacy Policy</a>.
          </p>
        </section>
      </article>
    </LegalLayout>
  );
}

function Faq({ question, answer }) {
  return (
    <div className="border-b border-gray-100 pb-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{question}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{answer}</p>
    </div>
  );
}
