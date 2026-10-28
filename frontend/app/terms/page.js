import LegalLayout from '../components/landing/LegalLayout';

export const metadata = {
  title: 'Terms of Service — ShopiReachBoost AI',
  description: 'Terms of Service for using the ShopiReachBoost AI Shopify app.',
};

export default function TermsPage() {
  return (
    <LegalLayout>
      <article className="prose prose-gray max-w-none">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Effective: October 28, 2026 &nbsp;·&nbsp; ShopiReachBoost AI (operated by Nirali Nakum), India
        </p>

        <Section title="1. Acceptance">
          <p>
            By installing or using the ShopiReachBoost AI Shopify app (the "App"), you agree to
            these Terms of Service ("Terms"). If you do not agree, do not install or use the App.
          </p>
        </Section>

        <Section title="2. What the App Does">
          <p>ShopiReachBoost AI provides the following features to Shopify merchants:</p>
          <ul>
            <li>Web push notifications to store visitors who grant browser push permission.</li>
            <li>Abandoned cart recovery emails to shoppers whose email address was captured.</li>
            <li>A Cash on Delivery (COD) order form for collecting orders directly on the storefront.</li>
            <li>AI-generated message copy for push notifications and emails, cached and reused across sends.</li>
          </ul>
          <p>
            The App is designed for use by Shopify merchants. It operates by embedding a script on
            the merchant's storefront and by making calls to Shopify's Admin API on the merchant's
            behalf.
          </p>
        </Section>

        <Section title="3. Merchant Responsibilities">
          <p>As a merchant using the App, you are responsible for:</p>
          <ul>
            <li>
              Ensuring your use of the App complies with the laws applicable in your jurisdiction,
              including laws about electronic marketing, data collection, and consumer privacy.
            </li>
            <li>
              Obtaining any consents required by applicable law before sending push notifications
              or marketing emails to your shoppers.
            </li>
            <li>
              The accuracy of any information you configure in the App (product names, store
              details, email templates, and discount codes).
            </li>
            <li>
              Not using the App to send unsolicited communications or to engage in deceptive or
              misleading practices.
            </li>
            <li>
              Promptly processing any shopper data deletion or data access requests you receive,
              using Shopify's admin tools to trigger the App's deletion handlers.
            </li>
          </ul>
        </Section>

        <Section title="4. Shopify Platform">
          <p>
            The App requires the Shopify platform and is distributed through the Shopify App Store.
            Your use of Shopify is governed by Shopify's own Terms of Service and policies. We are
            not affiliated with or endorsed by Shopify Inc. beyond the standard Shopify Partner
            relationship required to list the App on the App Store.
          </p>
        </Section>

        <Section title="5. Data and Privacy">
          <p>
            Our collection and use of data is described in our{' '}
            <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>. By
            installing the App you agree to the Privacy Policy as it applies to data we process on
            your behalf.
          </p>
        </Section>

        <Section title="6. Fees and Billing">
          <p>
            The App may offer a free tier and one or more paid plans. Billing is processed through
            Shopify's billing API. If you cancel your paid plan, your access will revert to the
            free tier at the end of the current billing period.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            The App and its content, features, and functionality are owned by Nirali Nakum. You may
            not copy, modify, distribute, sell, or reverse-engineer the App or any part of it.
          </p>
        </Section>

        <Section title="8. Disclaimers">
          <p>
            The App is provided "as is" and "as available" without warranty of any kind. We do not
            warrant that the App will be uninterrupted, error-free, or that any particular result
            will be achieved by using it. Push notification delivery rates depend on factors outside
            our control, including browser permission status, browser vendor policies, and Shopify
            platform availability. Email delivery rates depend on recipient email providers and
            spam-filtering systems beyond our control.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, ShopiReachBoost AI and Nirali Nakum
            are not liable for any indirect, incidental, special, or consequential damages arising
            from your use of, or inability to use, the App.
          </p>
        </Section>

        <Section title="10. Changes to These Terms">
          <p>
            We may update these Terms from time to time. Updated Terms will be posted at this URL
            with a new effective date. Continued use of the App after an update constitutes
            acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            ShopiReachBoost AI (operated by Nirali Nakum)<br />
            India<br />
            <a
              href="mailto:niralinakum.vellirion@gmail.com"
              className="text-brand hover:underline"
            >
              niralinakum.vellirion@gmail.com
            </a>
          </p>
        </Section>
      </article>
    </LegalLayout>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-3 text-sm sm:text-base">{children}</div>
    </section>
  );
}
