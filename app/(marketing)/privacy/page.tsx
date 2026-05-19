import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { APP_NAME, APP_URL, CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '@/lib/site-config';

export const metadata: Metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
  description: `How ${APP_NAME} collects, uses, and protects your personal data.`,
};

export default function PrivacyPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-12">
          <p className="mb-3 text-sm font-medium text-emerald-400">Legal</p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-zinc-100">Privacy Policy</h1>
          <p className="text-sm text-zinc-500">Last updated: {LEGAL_LAST_UPDATED}</p>
        </div>

        <div className="[&_p]:text-zinc-400 [&_p]:leading-[1.75] [&_p]:mb-4 [&_ul]:text-zinc-400 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:leading-[1.75] [&_li]:mb-1.5 [&_address]:mt-2">
          <Section title="1. Introduction">
            <p>
              {APP_NAME} (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) operates the{' '}
              {APP_NAME} productivity platform available at{' '}
              <a href={APP_URL} className="text-emerald-400 hover:text-emerald-300">
                {APP_URL}
              </a>
              . This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you use our service, including data we access from your Google
              Account when you enable the Google Calendar integration.
            </p>
            <p>
              By using {APP_NAME}, you agree to the collection and use of information in accordance
              with this policy. If you do not agree, please discontinue use of the service.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <SubHeading>Account Information</SubHeading>
            <p>
              When you register, we collect your name, email address, and password (stored as a
              secure hash). If you sign in with Google, we receive your name, email address, and
              profile picture from Google&apos;s standard sign-in scopes (<code>openid</code>,{' '}
              <code>email</code>, <code>profile</code>).
            </p>
            <SubHeading>Content You Create</SubHeading>
            <p>
              We store the tasks, board columns, notes, journal entries, reminders, and other
              content you create while using {APP_NAME}. This data is associated with your account
              and your organization.
            </p>
            <SubHeading>Usage Data</SubHeading>
            <p>
              We may collect information about how you interact with {APP_NAME}, including pages
              visited, features used, timestamps, and browser/device information, to improve the
              service.
            </p>
            <SubHeading>Billing Information</SubHeading>
            <p>
              Payment processing is handled entirely by Lemon Squeezy, the merchant of record. We
              do not store your payment card details. We receive subscription status, plan type,
              and seat counts from Lemon Squeezy to manage your account entitlements.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul>
              <li>To provide, maintain, and improve the {APP_NAME} service</li>
              <li>To authenticate your identity and manage your account</li>
              <li>To sync tasks with Google Calendar when you have enabled this integration</li>
              <li>To process payments and manage your subscription via Lemon Squeezy</li>
              <li>To send transactional emails (e.g., account verification, password reset, reminders)</li>
              <li>To detect and prevent fraudulent or unauthorized use of the service</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p>
              We do <strong className="text-zinc-300">not</strong> sell your personal data to third
              parties. We do <strong className="text-zinc-300">not</strong> use your content, your
              Google user data, or any other personal data to train machine learning or AI models,
              including our own models or third-party models.
            </p>
          </Section>

          <Section title="4. Google User Data">
            <p>
              This section explains how {APP_NAME} accesses, uses, stores, and shares data from
              your Google Account, in accordance with the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>

            <SubHeading>4.1 Scopes We Request and Data We Access</SubHeading>
            <p>{APP_NAME} requests the following Google OAuth scopes only when you explicitly connect Google Calendar:</p>
            <ul>
              <li>
                <strong className="text-zinc-300">openid, email, profile</strong> — your Google
                account&apos;s unique identifier, email address, name, and profile picture. Used
                only to identify your account and personalize the UI.
              </li>
              <li>
                <strong className="text-zinc-300">
                  https://www.googleapis.com/auth/calendar.readonly
                </strong>{' '}
                — read-only access to the list of calendars in your Google Account, so you can
                choose which calendar to sync with. We do <strong className="text-zinc-300">not</strong>{' '}
                read or store the contents of events created outside of {APP_NAME}.
              </li>
              <li>
                <strong className="text-zinc-300">
                  https://www.googleapis.com/auth/calendar.events
                </strong>{' '}
                — permission to create, update, and delete calendar events on the calendar you
                selected, strictly for the {APP_NAME} tasks and reminders you have associated with
                that calendar.
              </li>
            </ul>

            <SubHeading>4.2 How We Use Google User Data</SubHeading>
            <p>We use Google user data exclusively to provide and improve user-facing features:</p>
            <ul>
              <li>
                Creating, updating, and removing calendar events on your selected Google Calendar
                so your {APP_NAME} tasks and reminders appear alongside the rest of your schedule
              </li>
              <li>
                Letting you pick which calendar to sync to from the list of your available
                calendars
              </li>
              <li>
                Showing your Google name, email, and profile picture inside {APP_NAME} so you can
                verify which Google Account is connected
              </li>
            </ul>
            <p>
              Google user data is <strong className="text-zinc-300">not</strong> used for
              advertising, profiling, analytics outside the integration itself, or training any AI
              or machine-learning models.
            </p>

            <SubHeading>4.3 How We Store Google User Data</SubHeading>
            <ul>
              <li>
                <strong className="text-zinc-300">OAuth refresh token</strong> — encrypted at rest
                with AES-256-GCM and stored in our Supabase (PostgreSQL) database. The token is
                used server-side to call the Google Calendar API on your behalf.
              </li>
              <li>
                <strong className="text-zinc-300">Calendar event IDs</strong> — for each {APP_NAME}{' '}
                task we sync, we store the Google Calendar event ID that {APP_NAME} created. This
                lets us update or delete the event when the underlying task changes. We do not
                store event titles, descriptions, attendees, or any other event content.
              </li>
              <li>
                <strong className="text-zinc-300">Profile fields</strong> — your name, email, and
                profile picture URL received from Google sign-in are stored on your {APP_NAME}{' '}
                account record.
              </li>
            </ul>
            <p>
              All data is transmitted over TLS/HTTPS. Calendar event contents themselves remain on
              Google&apos;s servers and are not mirrored to {APP_NAME}.
            </p>

            <SubHeading>4.4 How We Share Google User Data</SubHeading>
            <p>
              We do <strong className="text-zinc-300">not</strong> sell, rent, or share your Google
              user data with any third party. Google user data is processed only:
            </p>
            <ul>
              <li>
                By {APP_NAME} servers (hosted on Vercel) and our database provider (Supabase),
                acting strictly as our data processors
              </li>
              <li>
                By Google itself when we make API calls back to your Google Calendar on your
                instruction
              </li>
            </ul>

            <SubHeading>4.5 Data Retention and Revocation</SubHeading>
            <p>
              Your refresh token and stored event IDs are retained for as long as the Google
              Calendar integration is connected. You can revoke {APP_NAME}&apos;s access at any
              time by:
            </p>
            <ul>
              <li>
                Using the &ldquo;Disconnect Google Calendar&rdquo; button inside {APP_NAME}{' '}
                settings — this deletes the stored refresh token and all event-link records
                immediately
              </li>
              <li>
                Visiting{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  myaccount.google.com/permissions
                </a>{' '}
                and removing {APP_NAME} from your authorized apps
              </li>
            </ul>
            <p>
              If you delete your {APP_NAME} account, all Google user data we hold about you is
              deleted along with it (see Section 8 — Data Retention).
            </p>

            <SubHeading>4.6 Limited Use Disclosure</SubHeading>
            <p>
              {APP_NAME}&apos;s use and transfer of information received from Google APIs to any
              other app will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically:
            </p>
            <ul>
              <li>
                We only use Google user data to provide the user-facing Google Calendar
                synchronization feature described above
              </li>
              <li>
                We do not transfer Google user data to third parties except as necessary to provide
                or improve user-facing features, comply with applicable law, or as part of a merger
                or acquisition (in which case successor entities will be bound by this policy)
              </li>
              <li>We do not use Google user data to serve ads of any kind</li>
              <li>
                We do not allow humans to read your Google user data unless we have your
                affirmative agreement for specific items, it is necessary for security purposes
                (e.g., investigating abuse), or to comply with applicable law
              </li>
            </ul>
          </Section>

          <Section title="5. Data Storage and Security">
            <p>
              Your data is stored in Supabase (PostgreSQL), hosted on secure cloud infrastructure.
              Google Calendar refresh tokens are encrypted at rest using AES-256-GCM before
              storage. All data in transit is encrypted via TLS/HTTPS.
            </p>
            <p>
              While we implement industry-standard safeguards, no method of electronic storage is
              100% secure. We cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="6. Third-Party Services">
            <p>{APP_NAME} integrates with the following third-party services:</p>
            <ul>
              <li>
                <strong className="text-zinc-300">Supabase</strong> — database and authentication
                infrastructure
              </li>
              <li>
                <strong className="text-zinc-300">Google APIs</strong> — Sign-in with Google and
                Google Calendar integration (see Section 4 for details)
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

          <Section title="7. Cookies">
            <p>
              We use session cookies required for authentication (NextAuth.js session token) and
              short-lived cookies for OAuth state verification (e.g., Google Calendar connection
              flow). We do not use advertising or tracking cookies.
            </p>
          </Section>

          <Section title="8. Data Retention">
            <p>
              We retain your data for as long as your account is active. If you delete your
              account, we will delete or anonymize your personal data — including any stored Google
              refresh tokens and calendar event-link records — within 30 days, except where
              retention is required by law or legitimate business purposes (e.g., billing records).
            </p>
          </Section>

          <Section title="9. Your Rights">
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your data in a portable format</li>
              <li>
                Withdraw consent for optional data processing (e.g., disconnect Google Calendar)
              </li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-emerald-400 hover:text-emerald-300"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>
              {APP_NAME} is not directed at children under the age of 16. We do not knowingly
              collect personal data from children. If you believe a child has provided us with
              personal information, please contact us immediately.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              significant changes by email or by posting a prominent notice on the service.
              Continued use of {APP_NAME} after changes constitutes your acceptance of the updated
              policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              If you have questions or concerns about this Privacy Policy, or wish to exercise any
              of the rights described above, please contact us at:
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
