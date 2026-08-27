/*
    api/services.js

    Endpoint PUBLIC (pas de session requise) — remplace
    les tableaux "services" et "polissageAddon" codés en
    dur dans booking.js. Ne retourne que ce qui est actif,
    donc désactiver un forfait dans l'admin le fait
    disparaître ici automatiquement.

    GET /api/services
*/

const { sql } = require("@vercel/postgres");


module.exports = async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    try {

        const { rows: serviceRows } = await sql`
            SELECT id, name, description, base_duration_minutes, flat_price_cents, features, display_section, type
            FROM services
            WHERE active = true
            ORDER BY base_duration_minutes
        `;

        const { rows: pricingRows } = await sql`
            SELECT service_id, vehicle_size, cleaning_type, price_cents
            FROM service_pricing
        `;

        const { rows: addonRows } = await sql`
            SELECT id, name, description, price_cents, duration_minutes, eligible_service_ids
            FROM addons
            WHERE active = true
        `;

        const services = serviceRows.map(service => ({
            id: service.id,
            name: service.name,
            description: service.description,
            duration: service.base_duration_minutes / 60,
            flatPrice: service.flat_price_cents !== null
                ? service.flat_price_cents / 100
                : null,
            features: service.features || [],
            displaySection: service.display_section,
            type: service.type,
            pricing: pricingRows
                .filter(row => row.service_id === service.id)
                .map(row => ({
                    vehicleSize: row.vehicle_size,
                    cleaningType: row.cleaning_type,
                    price: row.price_cents / 100
                }))
        }));

        const addons = addonRows.map(addon => ({
            id: addon.id,
            name: addon.name,
            description: addon.description,
            price: addon.price_cents / 100,
            duration: addon.duration_minutes / 60,
            eligibleServiceIds: addon.eligible_service_ids || []
        }));

        res.status(200).json({ services, addons });

    } catch (error) {

        console.error("Erreur /api/services:", error);

        res.status(500).json({ error: error.message || "Erreur serveur inconnue" });
    }
};