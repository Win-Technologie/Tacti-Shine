const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/api/reserver', async (req, res) => {
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
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erreur nodemailer:', err);
    res.status(500).json({ error: "Échec de l'envoi du courriel." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`port du backend http://localhost:${PORT}`));