/*
    api/admin/login.js

    POST { password } -> vérifie contre ADMIN_PASSWORD,
    pose un cookie de session httpOnly si correct.
*/

const { createSessionToken } = require("../../lib/verify-session");


module.exports = async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    const { password } = req.body || {};

    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Mot de passe incorrect" });
    }

    const token = createSessionToken();

    const maxAgeSeconds = 8 * 60 * 60; // 8 heures

    res.setHeader(
        "Set-Cookie",
        `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`
    );

    res.status(200).json({ ok: true });
};
