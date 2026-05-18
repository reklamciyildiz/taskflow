import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Terms of Service — Axiom',
  description: 'Terms and conditions governing your use of the Axiom productivity platform.',
};

const LAST_UPDATED = 'May 19, 2026';
const CONTACT_EMAIL = 'support@getaxiomm.vercel.app';
const APP_URL = 'https://getaxiomm.vercel.app';

export default function TermsPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-12">
          <p className="mb-3 text-sm font-medium text-emerald-400">Legal</p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-zinc-100">Terms of Service</h1>
          <p className="text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-legal">
          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using Axiom (&ldquo;the Service&rdquo;) at{' '}
              <a href={APP_URL} className="text-emerald-400 hover:text-emerald-300">
                {APP_URL}
              </a>
              , you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not
              agree to these Terms, do not use the Service.
            </p>
            <p>
              These Terms apply to all users, including individuals, teams, and organizations. If
              you are using Axiom on behalf of an organization, you represent that you have authority
              to bind that organization to these Terms.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              Axiom is a team productivity platform offering task management, kanban boards, knowledge
              hub, reminders, team collaboration, and integrations with third-party services such as
              Google Calendar. The Service is provided as a software-as-a-service (SaaS) application
              accessible via web browser and as a Progressive Web App (PWA).
            </p>
          </Section>

          <Section title="3. Accounts and Registration">
            <p>
              To use Axiom, you must create an account with a valid email address. You are
              responsible for:
            </p>
            <ul>
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Notifying us immediately of any unauthorized use of your account</li>
            </ul>
            <p>
              You must not create accounts using automated means or under false pretenses. We reserve
              the right to suspend or terminate accounts that violate these Terms.
            </p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree not to use the Service to:</p>
            <ul>
              <li>Violate any applicable laws or regulations</li>
              <li>Upload or transmit malicious code, malware, or harmful content</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
              <li>Use the Service to harass, abuse, or harm others</li>
              <li>Scrape, crawl, or extract data from the Service without authorization</li>
              <li>Resell or commercially exploit the Service without our written permission</li>
            </ul>
          </Section>

          <Section title="5. Subscriptions and Billing">
            <p>
              Axiom offers free and paid subscription plans. Paid plans are billed through Lemon
              Squeezy, our payment processor. By subscribing to a paid plan, you agree to:
            </p>
            <ul>
              <li>Pay all applicable fees for your selected plan</li>
              <li>Provide accurate and current billing information</li>
              <li>Authorize us to charge your payment method on a recurring basis</li>
            </ul>
            <p>
              Subscription fees are non-refundable except as required by applicable law or as
              expressly stated in our refund policy. We reserve the right to change pricing with
              30 days&rsquo; notice to active subscribers.
            </p>
            <p>
              If a payment fails, we may suspend access to paid features until payment is resolved.
              You can manage, upgrade, downgrade, or cancel your subscription at any time via the
              billing portal in your account settings.
            </p>
          </Section>

          <Section title="6. Your Content">
            <p>
              You retain ownership of all content you create in Axiom (tasks, notes, journal entries,
              etc.). By using the Service, you grant us a limited, non-exclusive license to store,
              process, and display your content solely for the purpose of providing the Service to
              you.
            </p>
            <p>
              You are solely responsible for the content you create and share within Axiom. You
              represent that your content does not violate any third-party rights or applicable laws.
            </p>
          </Section>

          <Section title="7. Third-Party Integrations">
            <p>
              Axiom integrates with third-party services including Google Calendar and Lemon Squeezy.
              Your use of these integrations is subject to the respective third-party terms of service
              and privacy policies. We are not responsible for the practices or content of third-party
              services.
            </p>
            <p>
              When you connect Google Calendar, you authorize Axiom to access your Google Calendar
              data in accordance with our{' '}
              <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300">
                Privacy Policy
              </Link>
              . You may disconnect this integration at any time from your account settings.
            </p>
          </Section>

          <Section title="8. Intellectual Property">
            <p>
              The Axiom name, logo, design, software, and all associated intellectual property are
              owned by us and protected by applicable intellectual property laws. Nothing in these
              Terms grants you any right to use our trademarks, logos, or other proprietary
              materials.
            </p>
          </Section>

          <Section title="9. Availability and Modifications">
            <p>
              We strive to maintain high availability of the Service but do not guarantee
              uninterrupted access. We reserve the right to modify, suspend, or discontinue any
              aspect of the Service at any time, with reasonable notice where practicable.
            </p>
            <p>
              We may update these Terms from time to time. We will notify you of material changes
              via email or in-app notice. Continued use of the Service after the effective date
              constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="10. Disclaimer of Warranties">
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
              WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
              WARRANT THAT THE SERVICE WILL BE ERROR-FREE, SECURE, OR UNINTERRUPTED.
            </p>
          </Section>

          <Section title="11. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
              PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE.
            </p>
            <p>
              OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING FROM OR RELATED TO THE
              SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO US IN THE 12
              MONTHS PRIOR TO THE CLAIM, OR (B) USD $100.
            </p>
          </Section>

          <Section title="12. Governing Law">
            <p>
              These Terms are governed by and construed in accordance with applicable law. Any
              disputes shall be resolved through binding arbitration or in the courts of competent
              jurisdiction, as determined by applicable law.
            </p>
          </Section>

          <Section title="13. Termination">
            <p>
              You may terminate your account at any time by contacting us or using the account
              deletion option in settings. We may terminate or suspend your access for violations of
              these Terms, illegal activity, or non-payment, with or without prior notice depending
              on the severity of the violation.
            </p>
            <p>
              Upon termination, your right to use the Service ceases immediately. Sections that by
              their nature should survive termination (including intellectual property, disclaimers,
              and limitations of liability) will survive.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>For questions about these Terms, please contact us at:</p>
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
          <Link href="/privacy" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            Privacy Policy →
          </Link>
        </div>
      </main>
      <MarketingFooter />

      <style jsx>{`
        .prose-legal :global(p) {
          color: rgb(161 161 170);
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .prose-legal :global(ul) {
          color: rgb(161 161 170);
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
          line-height: 1.75;
        }
        .prose-legal :global(li) {
          margin-bottom: 0.4rem;
        }
        .prose-legal :global(address) {
          margin-top: 0.5rem;
        }
      `}</style>
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
