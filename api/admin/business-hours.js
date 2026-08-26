/*
    api/admin/business-hours.js

    GET /api/admin/business-hours
        -> { days: [{ dayOfWeek, isOpen, startHour, endHour }, ...] }
           toujours 7 entrées, 0 (dimanche) à 6 (samedi).
           startHour/endHour sont null si isOpen est false.

    PUT /api/admin/business-hours
        body: { days: [{ dayOfWeek, isOpen, startHour, endHour }, ...] }
        Remplace l'horaire au complet (les 7 jours à la fois) —
        plus simple que de gérer des upserts jour par jour, et
        c'est exactement comme le bouton "Enregistrer" de la
        maquette fonctionne (un seul save pour toute la grille).
*/

const { isAuthenticated } = require("../../lib/verify-session");
const { sql } = require("@vercel/postgres");


module.exports = async function handler(req, res) {

    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: "Non autorisé" });
    }

    try {

        if (req.method === "GET") {
            return await handleGet(req, res);
        }

        if (req.method === "PUT") {
            return await handlePut(req, res);
        }

        return res.status(405).json({ error: "Méthode non autorisée" });

    } catch (error) {

        console.error("Erreur /api/admin/business-hours:", error);

        return res.status(500).json({
            error: error.message || "Erreur serveur inconnue"
        });
    }
};


/* =========================================
   GET
========================================= */

async function handleGet(req, res) {

    const { rows } = await sql`
        SELECT day_of_week, start_time, end_time
        FROM business_hours
        ORDER BY day_of_week
    `;

    const days = [];

    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {

        const row = rows.find(r => r.day_of_week === dayOfWeek);

        days.push({
            dayOfWeek,
            isOpen: !!row,
            startHour: row ? parseInt(row.start_time.split(":")[0], 10) : null,
            endHour: row ? parseInt(row.end_time.split(":")[0], 10) : null
        });
    }

    res.status(200).json({ days });
}


/* =========================================
   PUT
========================================= */

async function handlePut(req, res) {

    const { days } = req.body || {};

    if (!Array.isArray(days) || days.length !== 7) {
        return res.status(400).json({ error: "days doit contenir exactement 7 entrées (0 à 6)" });
    }

    for (const day of days) {

        const { dayOfWeek, isOpen, startHour, endHour } = day;

        if (
            typeof dayOfWeek !== "number" ||
            dayOfWeek < 0 || dayOfWeek > 6
        ) {
            return res.status(400).json({ error: "dayOfWeek invalide" });
        }

        if (isOpen && (
            typeof startHour !== "number" ||
            typeof endHour !== "number" ||
            startHour < 0 || startHour > 23 ||
            endHour < 1 || endHour > 24 ||
            startHour >= endHour
        )) {
            return res.status(400).json({ error: `Heures invalides pour le jour ${dayOfWeek}` });
        }
    }

    // Plus simple de tout remplacer que de calculer un diff —
    // cette table est petite (7 lignes max) et rarement modifiée.
    await sql`DELETE FROM business_hours`;

    for (const day of days) {

        if (!day.isOpen) {
            continue;
        }

        const startTime = `${String(day.startHour).padStart(2, "0")}:00:00`;
        const endTime = `${String(day.endHour).padStart(2, "0")}:00:00`;

        await sql`
            INSERT INTO business_hours (day_of_week, start_time, end_time)
            VALUES (${day.dayOfWeek}, ${startTime}, ${endTime})
        `;
    }

    res.status(200).json({ ok: true });
}