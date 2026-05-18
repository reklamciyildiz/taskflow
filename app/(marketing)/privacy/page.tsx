import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy — Axiom',
  description: 'How Axiom collects, uses, and protects your personal data.',
};

const LAST_UPDATED = 'May 19, 2026';
const CONTACT_EMAIL = 'support@getaxiomm.vercel.app';
const APP_URL = 'https://getaxiomm.vercel.app';

export default function PrivacyPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-12">
          <p className="mb-3 text-sm font-medium text-emerald-400">Legal</p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-zinc-100">Privacy Policy</h1>
          <p className="text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="[&_p]:text-zinc-400 [&_p]:leading-[1.75] [&_p]:mb-4 [&_ul]:text-zinc-400 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:leading-[1.75] [&_li]:mb-1.5 [&_address]:mt-2">
          <Section title="1. Introduction">
            <p>
              Axiom (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) operates the Axiom
              productivity platform available at{' '}
              <a href={APP_URL} className="text-emerald-400 hover:text-emerald-300">
                {APP_URL}
              </a>
              . This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you use our service.
            </p>
            <p>
              By using Axiom, you agree to the collection and use of information in accordance with
              this policy. If you do not agree, please discontinue use of the service.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <SubHeading>Account Information</SubHeading>
            <p>
              When you register, we collect your name, email address, and password (stored as a
              secure hash). If you sign in with Google, we receive your name, email, and profile
              picture from Google.
            </p>
            <SubHeading>Content You Create</SubHeading>
            <p>
              We store the tasks, board columns, notes, journal entries, reminders, and other
              content you create while using Axiom. This data is associated with your account and
              your organization.
            </p>
            <SubHeading>Usage Data</SubHeading>
            <p>
              We may collect information about how you interact with Axiom, including pages visited,
              features used, timestamps, and browser/device information, to improve the service.
            </p>
            <SubHeading>Google Calendar Data</SubHeading>
            <p>
              If you connect Google Calendar, we store an encrypted OAuth refresh token to sync your
              tasks with your calendar. We access only the calendar scopes you authorize
              (calendar.events, calendar.readonly). We do not read or store calendar events created
              outside of Axiom.
            </p>
            <SubHeading>Billing Information</SubHeading>
            <p>
              Payment processing is handled entirely by Lemon Squeezy. We do not store your payment
              card details. We receive subscription status, plan type, and seat counts from Lemon
              Squeezy to manage your account entitlements.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul>
              <li>To provide, maintain, and improve the Axiom service</li>
              <li>To authenticate your identity and manage your account</li>
              <li>To sync tasks with Google Calendar when you have enabled this integration</li>
              <li>To process payments and manage your subscription via Lemon Squeezy</li>
              <li>To send transactional emails (e.g., account verification, password reset)</li>
              <li>To detect and prevent fraudulent or unauthorized use of the service</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p>
              We do not sell your personal data to third parties. We do not use your content to
              train machine learning models.
            </p>
          </Section>

          <Section title="4. Data Storage and Security">
            <p>
              Your data is stored in Supabase (PostgreSQL), hosted on secure cloud infrastructure.
              Google Calendar refresh tokens are encrypted at rest using AES-256-GCM before storage.
              All data in transit is encrypted via TLS/HTTPS.
            </p>
            <p>
              While we implement industry-standard safeguards, no method of electronic storage is
              100% secure. We cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="5. Third-Party Services">
            <p>Axiom integrates with the following third-party services:</p>
            <ul>
              <li>
                <strong className="text-zinc-300">Supabase</strong> — database and authentication
                infrastructure
              </li>
              <li>
                <strong className="text-zinc-300">Google APIs</strong> — Sign-in with Google and
                Google Calendar integration
              </li>
              <li>
                <strong className="text-zinc-300">Lemon Squeezy</strong> — subscription billing and
                payment processing
              </li>
              <li>
                <strong className="text-zinc-300">Vercel</strong> — application hosting and edge
                infrastructure
              </li>
            </ul>
            <p>
              Each of these providers has its own privacy policy governing the data they process on
              our behalf.
            </p>
          </Section>

          <Section title="6. Cookies">
            <p>
              We use session cookies required for authentication (NextAuth.js session token) and
              short-lived cookies for OAuth state verification (e.g., Google Calendar connection
              flow). We do not use advertising or tracking cookies.
            </p>
          </Section>

          <Section title="7. Data Retention">
            <p>
              We retain your data for as long as your account is active. If you delete your account,
              we will delete or anonymize your personal data within 30 days, except where retention
              is required by law or legitimate business purposes (e.g., billing records).
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for optional data processing (e.g., disconnect Google Calendar)</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-400 hover:text-emerald-300">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="9. Children's Privacy">
            <p>
              Axiom is not directed at children under the age of 16. We do not knowingly collect
              personal data from children. If you believe a child has provided us with personal
              information, please contact us immediately.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant
              changes by email or by posting a prominent notice on the service. Continued use of
              Axiom after changes constitutes your acceptance of the updated policy.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <address className="not-italic text-zinc-400">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-400 hover:text-emerald-300"
              >
                {CONTACT_EMAIL}
              </a>
            </address>
          </Section>
        </div>

        <div className="mt-16 border-t border-white/[0.06] pt-8 text-sm text-zinc-600">
          <Link href="/terms" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            Terms of Service →
          </Link>
        </div>
      </main>
      <MarketingFooter />

    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-5 font-semibold text-zinc-300">{children}</h3>;
}
