import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPriceDropEmail(to, productName, oldPrice, newPrice, link) {
  try {
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: [to],
      subject: `🔔 O preço caiu! ${productName}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>🔥 O preço caiu!</h2>

          <p>O produto <strong>${productName}</strong> baixou de preço.</p>

          <p>
            💸 <strong>Antes:</strong> R$ ${oldPrice}<br>
            🤑 <strong>Agora:</strong> R$ ${newPrice}
          </p>

          <a href="${link}" style="
            display:inline-block;
            margin-top:15px;
            padding:10px 15px;
            background:#0070f3;
            color:#fff;
            text-decoration:none;
            border-radius:5px;
          ">
            Ver oferta
          </a>

          <p style="margin-top:20px; font-size:12px; color:#666;">
            EconomIA 🚀
          </p>
        </div>
      `
    });

    console.log("✅ Email enviado");
  } catch (error) {
    console.error("❌ Erro ao enviar email:", error);
  }
}
