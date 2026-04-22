import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_NAME = 'Axiom';
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const VERIFIED_DOMAIN = process.env.RESEND_FROM_EMAIL; // e.g., "noreply@yourdomain.com"

interface SendInvitationEmailParams {
  to: string;
  inviterName: string;
  organizationName: string;
  role: string;
  inviteToken: string;
}

export async function sendInvitationEmail({
  to,
  inviterName,
  organizationName,
  role,
  inviteToken,
}: SendInvitationEmailParams) {
  const inviteUrl = `${APP_URL}/invite/${inviteToken}`;

  // In development without verified domain, log email instead of sending
  if (IS_DEVELOPMENT && !VERIFIED_DOMAIN) {
    console.log('\n📧 ═══════════════════════════════════════════════════════════');
    console.log('   INVITATION EMAIL (Development Mode - Not Actually Sent)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   To: ${to}`);
    console.log(`   From: ${inviterName}`);
    console.log(`   Organization: ${organizationName}`);
    console.log(`   Role: ${role}`);
    console.log(`   Invite Link: ${inviteUrl}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    return { success: true, data: { id: 'dev-mode-email' } };
  }

  const fromEmail = VERIFIED_DOMAIN || `${APP_NAME} <onboarding@resend.dev>`;

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject: `You're invited to join ${organizationName} on ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>You're Invited!</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 40px 40px 30px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                          ✉️ You're Invited!
                        </h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                          Hi there,
                        </p>
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                          <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on ${APP_NAME} as a <strong style="text-transform: capitalize;">${role}</strong>.
                        </p>
                        
                        <!-- Organization Card -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin: 30px 0;">
                          <tr>
                            <td style="padding: 20px;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="width: 50px; vertical-align: top;">
                                    <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                      <span style="color: #ffffff; font-size: 20px; font-weight: 700;">${organizationName.charAt(0).toUpperCase()}</span>
                                    </div>
                                  </td>
                                  <td style="padding-left: 15px;">
                                    <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Organization</p>
                                    <p style="margin: 0; color: #111827; font-size: 18px; font-weight: 600;">${organizationName}</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="padding: 10px 0 30px;">
                              <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
                                Accept Invitation
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px; line-height: 1.6;">
                          Or copy and paste this link into your browser:
                        </p>
                        <p style="margin: 0 0 30px; color: #3b82f6; font-size: 14px; word-break: break-all;">
                          <a href="${inviteUrl}" style="color: #3b82f6; text-decoration: none;">${inviteUrl}</a>
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                        
                        <p style="margin: 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">
                          This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f9fafb; padding: 25px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                          Powered by <strong>${APP_NAME}</strong>
                        </p>
                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                          Task management made simple for teams
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send invitation email:', error);
      return { success: false, error: error.message };
    }

    console.log('Invitation email sent successfully:', data);
    return { success: true, data };
  } catch (error: any) {
    console.error('Error sending invitation email:', error);
    return { success: false, error: error.message };
  }
}

interface SendWelcomeEmailParams {
  to: string;
  name: string;
  organizationName: string;
}

export async function sendWelcomeEmail({
  to,
  name,
  organizationName,
}: SendWelcomeEmailParams) {
  // In development without verified domain, log email instead of sending
  if (IS_DEVELOPMENT && !VERIFIED_DOMAIN) {
    console.log('\n🎉 ═══════════════════════════════════════════════════════════');
    console.log('   WELCOME EMAIL (Development Mode - Not Actually Sent)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   To: ${to}`);
    console.log(`   Name: ${name}`);
    console.log(`   Organization: ${organizationName}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    return { success: true, data: { id: 'dev-mode-email' } };
  }

  const fromEmail = VERIFIED_DOMAIN || `${APP_NAME} <onboarding@resend.dev>`;

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject: `Welcome to ${organizationName} on ${APP_NAME}!`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <tr>
                      <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🎉 Welcome to the team!</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">Hi ${name},</p>
                        <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                          You've successfully joined <strong>${organizationName}</strong> on ${APP_NAME}. You're all set to start collaborating with your team!
                        </p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="padding: 20px 0;">
                              <a href="${APP_URL}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                                Go to Dashboard
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #f9fafb; padding: 25px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">Powered by <strong>${APP_NAME}</strong></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
}
