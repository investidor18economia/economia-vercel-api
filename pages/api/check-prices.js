export default async function handler(req, res) {
  try {
    const mod = await import("../../lib/email.js");
    const sendPriceDropEmail = mod.sendPriceDropEmail;

    await sendPriceDropEmail(
      "fpr181199@gmail.com",
      "iPhone Teste",
      5000,
      3000,
      "https://example.com"
    );

    return res.status(200).json({
      success: true,
      message: "email enviado direto"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
