/*
    api/cron/cleanup-holds.js

    Supprime les holds expirés — sans ça, un client qui
    abandonne sa réservation en cours de route (ferme
    l'onglet, etc.) laisserait le créneau verrouillé
    pendant 10 minutes pour rien, mais la ligne resterait
    dans la table pour toujours sans ce nettoyage.

    Appelé automatiquement par Vercel Cron (voir
    vercel.json — une fois par jour, à 8h00 UTC /
    ~3-4h du matin heure du Québec — c'est le maximum
    permis sur le plan Hobby de Vercel).

    Ce n'est pas un problème pour la cohérence des
    réservations : partout où les holds sont utilisés
    (disponibilités, création d'un nouveau hold), le
    code filtre déjà sur "expires_at > now()", donc un
    hold expiré est ignoré même avant que ce cron ne
    l'efface. Ce nettoyage sert juste à garder la table
    propre, pas à éviter les conflits.

    Protégé par CRON_SECRET pour que seul Vercel Cron
    puisse l'appeler, pas n'importe qui qui devine l'URL.
*/

const { sql } = require("@vercel/postgres");


module.exports = async function handler(req, res) {

    const authHeader = req.headers.authorization;

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Non autorisé" });
    }

    try {

        const { rowCount } = await sql`
            DELETE FROM holds WHERE expires_at < now()
        `;

        console.log(`Cron: ${rowCount} hold(s) expiré(s) supprimé(s)`);

        res.status(200).json({ ok: true, deleted: rowCount });

    } catch (error) {

        console.error("Erreur /api/cron/cleanup-holds:", error);

        res.status(500).json({ error: error.message || "Erreur serveur inconnue" });
    }
};