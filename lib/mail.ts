import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_APP_PASSWORD,
  },
});

export async function sendVerificationEmail(to: string, token: string) {
  const verifyUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"MyMind" <${process.env.SMTP_USER}>`,
    to,
    subject: "Verifikasi email kamu — MyMind",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verifikasi Email Kamu</h2>
        <p>Terima kasih sudah daftar di MyMind. Klik tombol di bawah untuk verifikasi email kamu:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #1f6feb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Verifikasi Email
        </a>
        <p>Atau salin link berikut ke browser kamu:</p>
        <p style="word-break: break-all; color: #555;">${verifyUrl}</p>
        <p style="color: #999; font-size: 12px;">Link ini berlaku selama 24 jam. Kalau kamu tidak merasa daftar di MyMind, abaikan email ini.</p>
      </div>
    `,
  });
}
