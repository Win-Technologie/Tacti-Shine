/*
    api/admin/blocked-times.js

    GET    /api/admin/blocked-times          -> liste les blocages à venir
    POST   /api/admin/blocked-times          -> crée un blocage
                                                 body: { date, startTime, endTime, reason }
                                                 (startTime/endTime omis = bloque
                                                 toute la journée)
    DELETE /api/admin/blocked-times?id=xxx   -> retire un blocage
*/

const { isAuthenticated } = require("../../lib/verify-session");
const { sql } = require("@vercel/postgres");


module.exports = async function handler(req, res) {

    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: "Non autorisé" });
    }

    try {

        if (req.method === "GET") {
            return await handleList(req, res);
        }

        if (req.method === "POST") {
            return await handleCreate(req, res);
        }

        if (req.method === "DELETE") {
            return await handleDelete(req, res);
        }

        return res.status(405).json({ error: "Méthode non autorisée" });

    } catch (error) {

        // On log le détail côté serveur (visible dans le terminal
        // vercel dev / les logs Vercel), et on renvoie un message
        // JSON exploitable au client au lieu d'une page d'erreur
        // générique.
        console.error("Erreur /api/admin/blocked-times:", error);

        return res.status(500).json({
            error: error.message || "Erreur serveur inconnue"
        });
    }
};


/* =========================================
   LIST
========================================= */

async function handleList(req, res) {

    const { rows } = await sql`
        SELECT * FROM blocked_times
        WHERE blocked_date >= CURRENT_DATE
        ORDER BY blocked_date, start_time NULLS FIRST
    `;

    const blockedTimes = rows.map(row => ({
        id: row.id,
        date: row.blocked_date,
        startTime: row.start_time,
        endTime: row.end_time,
        reason: row.reason,
        wholeDay: row.start_time === null
    }));

    res.status(200).json({ blockedTimes });
}


/* =========================================
   CREATE
========================================= */

async function handleCreate(req, res) {

    const { date, startTime, endTime, reason } = req.body || {};

    if (!date) {
        return res.status(400).json({ error: "date est requise" });
    }

    // Soit les deux sont fournis (bloc partiel), soit aucun (journée complète)
    if ((startTime && !endTime) || (!startTime && endTime)) {
        return res.status(400).json({ error: "startTime et endTime doivent être fournis ensemble, ou omis tous les deux" });
    }

    await sql`
        INSERT INTO blocked_times (blocked_date, start_time, end_time, reason)
        VALUES (${date}, ${startTime || null}, ${endTime || null}, ${reason || ""})
    `;

    res.status(201).json({ ok: true });
}


/* =========================================
   DELETE
========================================= */

async function handleDelete(req, res) {

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: "id est requis" });
    }

    const { rowCount } = await sql`
        DELETE FROM blocked_times WHERE id = ${id}
    `;

    if (rowCount === 0) {
        return res.status(404).json({ error: "Blocage introuvable" });
    }

    res.status(200).json({ ok: true });
}