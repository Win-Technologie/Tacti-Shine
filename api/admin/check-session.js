/*
    api/admin/check-session.js

    Utilisé par admin/index.html au chargement pour
    savoir si l'utilisateur est connecté avant
    d'afficher le contenu du panel.
*/

const { isAuthenticated } = require("../../lib/verify-session");


module.exports = async function handler(req, res) {

    if (!isAuthenticated(req)) {
        return res.status(401).json({ authenticated: false });
    }

    res.status(200).json({ authenticated: true });
};
