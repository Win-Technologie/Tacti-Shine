/*
    api/admin/services.js

    CRUD complet pour les forfaits, protégé par la
    session admin.

    GET    /api/admin/services            -> liste tous les
                                              services (actifs
                                              ET désactivés),
                                              avec leur grille
                                              de prix
    POST   /api/admin/services            -> crée un service
    PUT    /api/admin/services            -> modifie un service
                                              existant (par id)
    PATCH  /api/admin/services            -> active/désactive
                                              un service (par id)
    DELETE /api/admin/services?id=xxx     -> supprime un service

    Body attendu pour POST / PUT :
    {
        id: "hivernale",
        name: "Opération Hivernale",
        description: "...",
        duration: 1.5,
        flatPrice: null,        // OU un nombre si prix fixe
        pricing: [               // vide/absent si flatPrice est utilisé
            { vehicleSize: "small", cleaningType: "interior", price: 89 },
            { vehicleSize: "small", cleaningType: "exterior", price: 89 },
            { vehicleSize: "small", cleaningType: "complete", price: 149 },
            { vehicleSize: "big",   cleaningType: "interior", price: 109 },
            { vehicleSize: "big",   cleaningType: "exterior", price: 109 },
            { vehicleSize: "big",   cleaningType: "complete", price: 179 }
        ]
    }
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

        if (req.method === "PUT") {
            return await handleUpdate(req, res);
        }

        if (req.method === "PATCH") {
            return await handleToggleActive(req, res);
        }

        if (req.method === "DELETE") {
            return await handleDelete(req, res);
        }

        return res.status(405).json({ error: "Méthode non autorisée" });

    } catch (error) {

        console.error("Erreur /api/admin/services:", error);

        if (error.code === "23505") {
            return res.status(409).json({ error: "Un service avec cet id existe déjà" });
        }

        return res.status(500).json({
            error: error.message || "Erreur serveur inconnue"
        });
    }
};


/* =========================================
   LIST
========================================= */

async function handleList(req, res) {

    const { rows: services } = await sql`
        SELECT id, name, description, base_duration_minutes, flat_price_cents, active
        FROM services
        ORDER BY name
    `;

    const { rows: pricingRows } = await sql`
        SELECT service_id, vehicle_size, cleaning_type, price_cents
        FROM service_pricing
    `;

    const servicesWithPricing = services.map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        duration: service.base_duration_minutes / 60,
        flatPrice: service.flat_price_cents !== null
            ? service.flat_price_cents / 100
            : null,
        active: service.active,
        pricing: pricingRows
            .filter(row => row.service_id === service.id)
            .map(row => ({
                vehicleSize: row.vehicle_size,
                cleaningType: row.cleaning_type,
                price: row.price_cents / 100
            }))
    }));

    res.status(200).json({ services: servicesWithPricing });
}


/* =========================================
   CREATE
========================================= */

async function handleCreate(req, res) {

    const { id, name, description, duration, flatPrice, pricing } = req.body || {};

    if (!id || !name || !duration) {
        return res.status(400).json({ error: "id, name et duration sont requis" });
    }

    const durationMinutes = Math.round(duration * 60);
    const flatPriceCents = flatPrice != null ? Math.round(flatPrice * 100) : null;

    try {

        await sql`
            INSERT INTO services (id, name, description, base_duration_minutes, flat_price_cents, active)
            VALUES (${id}, ${name}, ${description || ""}, ${durationMinutes}, ${flatPriceCents}, true)
        `;

        await insertPricingRows(id, pricing);

        res.status(201).json({ ok: true });

    } catch (error) {

        if (error.code === "23505") {
            // violation de clé primaire — l'id existe déjà
            return res.status(409).json({ error: "Un service avec cet id existe déjà" });
        }

        throw error;
    }
}


/* =========================================
   UPDATE
========================================= */

async function handleUpdate(req, res) {

    const { id, name, description, duration, flatPrice, pricing } = req.body || {};

    if (!id) {
        return res.status(400).json({ error: "id est requis" });
    }

    const durationMinutes = Math.round(duration * 60);
    const flatPriceCents = flatPrice != null ? Math.round(flatPrice * 100) : null;

    const { rowCount } = await sql`
        UPDATE services
        SET name = ${name},
            description = ${description || ""},
            base_duration_minutes = ${durationMinutes},
            flat_price_cents = ${flatPriceCents}
        WHERE id = ${id}
    `;

    if (rowCount === 0) {
        return res.status(404).json({ error: "Service introuvable" });
    }

    // Plus simple de tout réinsérer que de calculer un diff
    await sql`DELETE FROM service_pricing WHERE service_id = ${id}`;
    await insertPricingRows(id, pricing);

    res.status(200).json({ ok: true });
}


/* =========================================
   TOGGLE ACTIVE / INACTIVE
========================================= */

async function handleToggleActive(req, res) {

    const { id, active } = req.body || {};

    if (!id || typeof active !== "boolean") {
        return res.status(400).json({ error: "id et active (booléen) sont requis" });
    }

    const { rowCount } = await sql`
        UPDATE services
        SET active = ${active}
        WHERE id = ${id}
    `;

    if (rowCount === 0) {
        return res.status(404).json({ error: "Service introuvable" });
    }

    res.status(200).json({ ok: true });
}


/* =========================================
   DELETE
========================================= */

async function handleDelete(req, res) {

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: "id est requis" });
    }

    await sql`DELETE FROM service_pricing WHERE service_id = ${id}`;

    const { rowCount } = await sql`DELETE FROM services WHERE id = ${id}`;

    if (rowCount === 0) {
        return res.status(404).json({ error: "Service introuvable" });
    }

    res.status(200).json({ ok: true });
}


/* =========================================
   HELPER — insert pricing rows
========================================= */

async function insertPricingRows(serviceId, pricing) {

    if (!Array.isArray(pricing) || pricing.length === 0) {
        return;
    }

    for (const row of pricing) {

        const priceCents = Math.round(row.price * 100);

        await sql`
            INSERT INTO service_pricing (service_id, vehicle_size, cleaning_type, price_cents)
            VALUES (${serviceId}, ${row.vehicleSize}, ${row.cleaningType}, ${priceCents})
        `;
    }
}