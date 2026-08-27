/*
    api/holds.js

    POST /api/holds
    body: { date, serviceId, vehicleSize, cleaningType, addonIds, startTime }

    Recalcule tout côté serveur (prix, durée, disponibilité)
    — ne fait jamais confiance à ce que le client envoie.
    Verrouille le créneau 10 minutes le temps que le client
    remplisse ses informations.
*/

const { sql } = require("@vercel/postgres");
const { computeDuration } = require("../lib/pricing");
const {
    timeToMinutes,
    minutesToTime,
    getBusinessHoursMinutes,
    isDayFullyBlocked,
    getBusyIntervals,
    isSlotAvailable
} = require("../lib/availability-helpers");


const HOLD_DURATION_MS = 10 * 60 * 1000;


module.exports = async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    try {

        const { date, serviceId, vehicleSize, cleaningType, addonIds, startTime } = req.body || {};

        if (!date || !serviceId || !startTime) {
            return res.status(400).json({ error: "date, serviceId et startTime sont requis" });
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
        const isFlatPrice = service.flat_price_cents !== null;

        if (!isFlatPrice && (!vehicleSize || !cleaningType)) {
            return res.status(400).json({ error: "vehicleSize et cleaningType sont requis pour ce service" });
        }


        // Prix — calculé à partir de la grille en base, jamais du client
        let priceCents;

        if (isFlatPrice) {

            priceCents = service.flat_price_cents;

        } else {

            const { rows: priceRows } = await sql`
                SELECT price_cents FROM service_pricing
                WHERE service_id = ${serviceId}
                  AND vehicle_size = ${vehicleSize}
                  AND cleaning_type = ${cleaningType}
            `;

            if (priceRows.length === 0) {
                return res.status(400).json({ error: "Combinaison véhicule/type invalide pour ce service" });
            }

            priceCents = priceRows[0].price_cents;
        }


        const ids = Array.isArray(addonIds) ? addonIds : (addonIds ? [addonIds] : []);

        let addonDurationHours = 0;
        let addonPriceCents = 0;
        const validAddonIds = [];

        if (ids.length > 0) {

            const { rows: addonRows } = await sql`
                SELECT id, price_cents, duration_minutes, eligible_service_ids
                FROM addons
                WHERE id = ANY(${ids}) AND active = true
            `;

            addonRows.forEach(addon => {

                const eligible =
                    !addon.eligible_service_ids ||
                    addon.eligible_service_ids.length === 0 ||
                    addon.eligible_service_ids.includes(serviceId);

                if (eligible) {
                    addonDurationHours += addon.duration_minutes / 60;
                    addonPriceCents += addon.price_cents;
                    validAddonIds.push(addon.id);
                }
            });
        }


        const totalPriceCents = priceCents + addonPriceCents;

        const baseDurationHours = service.base_duration_minutes / 60;

        const durationHours = computeDuration(
            baseDurationHours,
            isFlatPrice ? null : vehicleSize,
            isFlatPrice ? null : cleaningType,
            addonDurationHours
        );

        const durationMinutes = durationHours * 60;


        const parsedDate = new Date(date + "T00:00:00");

        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: "date invalide" });
        }

        const dayOfWeek = parsedDate.getDay();

        const businessHours = await getBusinessHoursMinutes(dayOfWeek);

        if (!businessHours) {
            return res.status(409).json({ error: "Fermé ce jour-là" });
        }

        const fullyBlocked = await isDayFullyBlocked(date);

        if (fullyBlocked) {
            return res.status(409).json({ error: "Cette journée n'est pas disponible" });
        }

        const busyIntervals = await getBusyIntervals(date);

        const startMin = timeToMinutes(startTime);

        const stillAvailable = isSlotAvailable(
            businessHours,
            startMin,
            durationMinutes,
            busyIntervals
        );

        if (!stillAvailable) {
            return res.status(409).json({ error: "Ce créneau vient d'être pris. Veuillez en choisir un autre." });
        }

        const endTime = minutesToTime(startMin + durationMinutes);
        const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);


        const { rows: holdRows } = await sql`
            INSERT INTO holds (service_id, vehicle_size, cleaning_type, addon_ids, booking_date, start_time, end_time, expires_at)
            VALUES (${serviceId}, ${isFlatPrice ? null : vehicleSize}, ${isFlatPrice ? null : cleaningType}, ${validAddonIds}, ${date}, ${startTime}, ${endTime}, ${expiresAt.toISOString()})
            RETURNING id
        `;

        res.status(201).json({
            holdId: holdRows[0].id,
            expiresAt: expiresAt.toISOString(),
            startTime,
            endTime,
            duration: durationHours,
            price: totalPriceCents / 100
        });

    } catch (error) {

        console.error("Erreur /api/holds:", error);

        res.status(500).json({ error: error.message || "Erreur serveur inconnue" });
    }
};