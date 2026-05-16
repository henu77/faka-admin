import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  attachments?: Array<{ filename: string; path: string }>
): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    console.warn('[mail] SMTP not configured, skipping email to', to);
    return false;
  }

  try {
    await transport.sendMail({
      from: `"PPT导出服务" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log('[mail] Sent to', to);
    return true;
  } catch (err: any) {
    console.error('[mail] Failed:', err.message);
    return false;
  }
}

export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
