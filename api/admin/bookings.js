/*
    api/admin/bookings.js

    GET   /api/admin/bookings              -> liste toutes les réservations
    GET   /api/admin/bookings?date=YYYY-MM-DD -> filtre par date
    GET   /api/admin/bookings?upcoming=true   -> seulement à venir
    PATCH /api/admin/bookings                 -> annule une réservation
                                                  body: { id, status: "cancelled" }
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

        if (req.method === "PATCH") {
            return await handleUpdateStatus(req, res);
        }

        return res.status(405).json({ error: "Méthode non autorisée" });

    } catch (error) {

        console.error("Erreur /api/admin/bookings:", error);

        return res.status(500).json({
            error: error.message || "Erreur serveur inconnue"
        });
    }
};


/* =========================================
   LIST
========================================= */

async function handleList(req, res) {

    const { date, upcoming } = req.query;

    let rows;

    if (date) {

        ({ rows } = await sql`
            SELECT * FROM bookings
            WHERE booking_date = ${date}
            ORDER BY start_time
        `);

    } else if (upcoming === "true") {

        ({ rows } = await sql`
            SELECT * FROM bookings
            WHERE booking_date >= CURRENT_DATE
              AND status != 'cancelled'
            ORDER BY booking_date, start_time
        `);

    } else {

        ({ rows } = await sql`
            SELECT * FROM bookings
            ORDER BY booking_date DESC, start_time DESC
            LIMIT 200
        `);
    }

    const bookings = rows.map(row => ({
        id: row.id,
        bookingNumber: row.booking_number,
        serviceId: row.service_id,
        vehicleSize: row.vehicle_size,
        cleaningType: row.cleaning_type,
        addonIds: row.addon_ids,
        date: row.booking_date,
        startTime: row.start_time,
        endTime: row.end_time,
        price: row.total_price_cents / 100,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email,
        vehicleMake: row.vehicle_make,
        vehicleModel: row.vehicle_model,
        vehicleYear: row.vehicle_year,
        extraInfo: row.extra_info,
        status: row.status,
        createdAt: row.created_at
    }));

    res.status(200).json({ bookings });
}


/* =========================================
   UPDATE STATUS (annuler / réactiver)
========================================= */

async function handleUpdateStatus(req, res) {

    const { id, status } = req.body || {};

    if (!id || !status) {
        return res.status(400).json({ error: "id et status sont requis" });
    }

    const { rowCount } = await sql`
        UPDATE bookings
        SET status = ${status}
        WHERE id = ${id}
    `;

    if (rowCount === 0) {
        return res.status(404).json({ error: "Réservation introuvable" });
    }

    res.status(200).json({ ok: true });
}