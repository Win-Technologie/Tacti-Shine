/*
    api/availability.js

    GET /api/availability?date=YYYY-MM-DD&serviceId=sergent&vehicleSize=small&cleaningType=complete&addonIds=polissage

    vehicleSize / cleaningType sont requis pour un forfait
    à grille de prix, omis pour un forfait à prix fixe
    (ex: Entretien Annuel). addonIds est une liste séparée
    par des virgules, optionnelle.
*/

const { sql } = require("@vercel/postgres");
const { computeDuration } = require("../lib/pricing");
const {
    getBusinessHoursMinutes,
    isDayFullyBlocked,
    getBusyIntervals,
    generateAvailableSlots
} = require("../lib/availability-helpers");


module.exports = async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    try {

        const { date, serviceId, vehicleSize, cleaningType, addonIds } = req.query;

        if (!date || !serviceId) {
            return res.status(400).json({ error: "date et serviceId sont requis" });
        }

        const parsedDate = new Date(date + "T00:00:00");

        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: "date invalide" });
        }


        const { rows: serviceRows } = await sql`
            SELECT id, base_duration_minutes, flat_price_cents
            FROM services
            WHERE id = ${serviceId} AND active = true
        `;

        if (serviceRows.length === 0) {
            return res.status(404).json({ error: "Service introuvable ou inactif" });
        }

        const service = serviceRows[0];
        const baseDurationHours = service.base_duration_minutes / 60;

        // Un forfait à grille de prix a besoin de vehicleSize + cleaningType
        if (service.flat_price_cents === null && (!vehicleSize || !cleaningType)) {
            return res.status(400).json({ error: "vehicleSize et cleaningType sont requis pour ce service" });
        }


        let addonDurationHours = 0;

        if (addonIds) {

            const ids = addonIds.split(",").filter(Boolean);

            if (ids.length > 0) {

                const { rows: addonRows } = await sql`
                    SELECT duration_minutes FROM addons
                    WHERE id = ANY(${ids}) AND active = true
                `;

                addonDurationHours = addonRows.reduce(
                    (sum, row) => sum + row.duration_minutes / 60,
                    0
                );
            }
        }


        const durationHours = computeDuration(
            baseDurationHours,
            service.flat_price_cents === null ? vehicleSize : null,
            service.flat_price_cents === null ? cleaningType : null,
            addonDurationHours
        );

        const durationMinutes = durationHours * 60;


        const dayOfWeek = parsedDate.getDay();

        const businessHours = await getBusinessHoursMinutes(dayOfWeek);

        if (!businessHours) {
            return res.status(200).json({ availableTimes: [] });
        }

        const fullyBlocked = await isDayFullyBlocked(date);

        if (fullyBlocked) {
            return res.status(200).json({ availableTimes: [] });
        }

        const busyIntervals = await getBusyIntervals(date);

        const availableTimes = generateAvailableSlots(
            businessHours,
            durationMinutes,
            busyIntervals
        );

        res.status(200).json({ availableTimes });

    } catch (error) {

        console.error("Erreur /api/availability:", error);

        res.status(500).json({ error: error.message || "Erreur serveur inconnue" });
    }
};