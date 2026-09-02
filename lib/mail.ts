import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_APP_PASSWORD,
  },
});

export async function sendVerificationEmail(
  to: string,
  token: string,
  callbackUrl?: string | null,
) {
  const verifyUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${token}${
    callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""
  }`;

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

export async function sendInviteToExistingUserEmail(
  to: string,
  mindMapTitle: string,
  role: "EDITOR" | "VIEWER",
  mindMapId: string,
) {
  const openUrl = `${process.env.APP_URL}/editor/${mindMapId}`;

  await transporter.sendMail({
    from: `"MyMind" <${process.env.SMTP_USER}>`,
    to,
    subject: `Kamu ditambahkan ke mindmap "${mindMapTitle}" — MyMind`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Kamu Diberi Akses</h2>
        <p>Kamu ditambahkan sebagai <strong>${role}</strong> di mindmap "<strong>${mindMapTitle}</strong>".</p>
        <a href="${openUrl}" style="display: inline-block; padding: 12px 24px; background: #1f6feb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Buka Mindmap
        </a>
        <p style="word-break: break-all; color: #555;">${openUrl}</p>
      </div>
    `,
  });
}

export async function sendInviteToNewUserEmail(
  to: string,
  mindMapTitle: string,
  role: "EDITOR" | "VIEWER",
  token: string,
) {
  const inviteUrl = `${process.env.APP_URL}/api/invite/${token}`;

  await transporter.sendMail({
    from: `"MyMind" <${process.env.SMTP_USER}>`,
    to,
    subject: `Kamu diundang ke mindmap "${mindMapTitle}" — MyMind`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Kamu Diundang</h2>
        <p>Kamu diundang sebagai <strong>${role}</strong> di mindmap "<strong>${mindMapTitle}</strong>".</p>
        <p>Kamu belum terdaftar di MyMind. Klik tombol di bawah, daftar/login pakai email <strong>${to}</strong> ini (harus sama persis) supaya otomatis dapat akses:</p>
        <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background: #1f6feb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Terima Undangan
         </a>
        <p style="word-break: break-all; color: #555;">${inviteUrl}</p>
        <p style="color: #999; font-size: 12px;">Undangan ini berlaku selama 21 hari.</p>
      </div>
    `,
  });
}
