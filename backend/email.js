const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Senha de App do Gmail (não a senha normal)
  },
});

async function enviarResetSenha({ destinatario, nomeUsuario, token, appUrl }) {
  const link = `${appUrl}?reset=${token}`;

  await transporter.sendMail({
    from: `"SucataApp" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: '🔑 Redefinição de senha — SucataApp',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#2E7D32">♻️ SucataApp</h2>
        <p>Olá, <strong>${nomeUsuario}</strong>!</p>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
        <a href="${link}"
           style="display:inline-block;background:#2E7D32;color:white;padding:14px 28px;
                  border-radius:10px;text-decoration:none;font-weight:700;margin:16px 0">
          Redefinir minha senha
        </a>
        <p style="color:#757575;font-size:13px">
          Se você não solicitou isso, ignore este e-mail.<br>
          O link expira automaticamente em 1 hora.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#bbb;font-size:11px">SucataApp — Gestão de Materiais de Sucata</p>
      </div>
    `,
  });
}

module.exports = { enviarResetSenha };
