/*
    api/admin/logout.js

    Efface le cookie de session en le remplaçant
    par une version déjà expirée (Max-Age=0).
*/

module.exports = async function handler(req, res) {

    res.setHeader(
        "Set-Cookie",
        "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    );

    res.status(200).json({ ok: true });
};
