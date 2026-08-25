const nodemailer = require('nodemailer');

// Reuse the transporter across invocations when possible (helps with cold starts)
let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  return transporter;
}

module.exports = async (req, res) => {
  // Basic CORS handling (safe to keep even if frontend + API share the same domain)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const { nom, tel, courriel, vehicule, service, date, heure, message } = req.body || {};

  if (!nom || !tel || !service || !date || !heure) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    replyTo: courriel || undefined,
    subject: `Nouvelle réservation — ${nom}`,
    text: `
Nouvelle demande de réservation

Nom: ${nom}
Téléphone: ${tel}
Courriel: ${courriel || 'Non fourni'}
Véhicule: ${vehicule || 'Non fourni'}
Service: ${service}
Date souhaitée: ${date}
Heure souhaitée: ${heure}
Message: ${message || 'Aucun'}
    `.trim()
  };

  try {
    await getTransporter().sendMail(mailOptions);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erreur nodemailer:', err);
    return res.status(500).json({ error: "Échec de l'envoi du courriel." });
  }
};