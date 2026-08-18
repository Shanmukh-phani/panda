import nodemailer from 'nodemailer';

const env = (key: string) => String(process.env[key] || '').trim();

export const mailConfigured = () => !!(env('SMTP_USER') && env('SMTP_PASS'));

export const createMailer = () => {
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS').replace(/\s+/g, '');
  if (!user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';

  return nodemailer.createTransport({
    host: env('SMTP_HOST') || 'smtp.gmail.com',
    port,
    secure,
    auth: { user, pass },
  });
};

export const fromAddress = () => {
  const name = env('SMTP_FROM_NAME') || 'Panda Player';
  const email = env('SMTP_FROM_EMAIL') || env('SMTP_USER');
  return `"${name}" <${email}>`;
};

export const sendOtpMail = async (to: string, code: string) => {
  const transport = createMailer();
  if (!transport) throw new Error('SMTP is not configured');
  await transport.sendMail({
    from: fromAddress(),
    to,
    subject: `${code} is your Panda login code`,
    text: `Your Panda Player login code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;background:#111114;color:#F6F6F8">
      <p style="font-size:13px;letter-spacing:2px;color:#F5C14A;font-weight:700">PANDA PLAYER</p>
      <p style="font-size:16px;margin:16px 0 8px">Your login code is</p>
      <p style="font-size:36px;letter-spacing:10px;font-weight:800;margin:0 0 16px">${code}</p>
      <p style="color:#9B9BA6;font-size:13px">Expires in 10 minutes. If you did not request this, ignore this email.</p>
    </div>`,
  });
};
