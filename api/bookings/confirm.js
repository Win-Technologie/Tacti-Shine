/*
    api/bookings/confirm.js

    POST /api/bookings/confirm
    body: { holdId, customerName, phone, email, vehicleMake, vehicleModel, vehicleYear, extraInfo }

    Transforme un hold valide en réservation confirmée.
    Recalcule le prix depuis la base (jamais depuis le
    client), écrit dans "bookings", puis supprime le hold.
*/

const { sql } = require("@vercel/postgres");


module.exports = async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Méthode non autorisée" });
    }

    try {

        const {
            holdId,
            customerName,
            phone,
            email,
            vehicleMake,
            vehicleModel,
            vehicleYear,
            extraInfo
        } = req.body || {};

        if (!holdId || !customerName || !phone || !email) {
            return res.status(400).json({ error: "holdId, customerName, phone et email sont requis" });
        }


        const { rows: holdRows } = await sql`
            SELECT * FROM holds WHERE id = ${holdId}
        `;

        if (holdRows.length === 0) {
            return res.status(404).json({ error: "Réservation temporaire introuvable" });
        }

        const hold = holdRows[0];

        if (new Date(hold.expires_at) < new Date()) {

            await sql`DELETE FROM holds WHERE id = ${holdId}`;

            return res.status(410).json({ error: "Votre réservation temporaire a expiré. Veuillez recommencer." });
        }


        // Recalcule le prix depuis la base — jamais depuis le client
        const { rows: serviceRows } = await sql`
            SELECT flat_price_cents FROM services WHERE id = ${hold.service_id}
        `;

        if (serviceRows.length === 0) {
            return res.status(404).json({ error: "Service introuvable" });
        }

        let priceCents;

        if (serviceRows[0].flat_price_cents !== null) {

            priceCents = serviceRows[0].flat_price_cents;

        } else {

            const { rows: priceRows } = await sql`
                SELECT price_cents FROM service_pricing
                WHERE service_id = ${hold.service_id}
                  AND vehicle_size = ${hold.vehicle_size}
                  AND cleaning_type = ${hold.cleaning_type}
            `;

            if (priceRows.length === 0) {
                return res.status(400).json({ error: "Combinaison véhicule/type invalide" });
            }

            priceCents = priceRows[0].price_cents;
        }

        if (hold.addon_ids && hold.addon_ids.length > 0) {

            const { rows: addonRows } = await sql`
                SELECT price_cents FROM addons WHERE id = ANY(${hold.addon_ids})
            `;

            priceCents += addonRows.reduce((sum, row) => sum + row.price_cents, 0);
        }


        const bookingNumber = "BK-" + Math.floor(10000 + Math.random() * 90000);

        let inserted;

        try {

            const { rows } = await sql`
                INSERT INTO bookings (
                    booking_number, service_id, vehicle_size, cleaning_type, addon_ids,
                    booking_date, start_time, end_time, total_price_cents,
                    customer_name, customer_phone, customer_email,
                    vehicle_make, vehicle_model, vehicle_year, extra_info, status
                )
                VALUES (
                    ${bookingNumber}, ${hold.service_id}, ${hold.vehicle_size}, ${hold.cleaning_type}, ${hold.addon_ids},
                    ${hold.booking_date}, ${hold.start_time}, ${hold.end_time}, ${priceCents},
                    ${customerName}, ${phone}, ${email},
                    ${vehicleMake || null}, ${vehicleModel || null}, ${vehicleYear ? parseInt(vehicleYear) : null},
                    ${extraInfo || null}, 'confirmed'
                )
                RETURNING booking_number
            `;

            inserted = rows[0];

        } catch (error) {

            // Collision improbable sur booking_number — un seul réessai
            if (error.code === "23505") {

                const retryNumber = "BK-" + Math.floor(10000 + Math.random() * 90000);

                const { rows } = await sql`
                    INSERT INTO bookings (
                        booking_number, service_id, vehicle_size, cleaning_type, addon_ids,
                        booking_date, start_time, end_time, total_price_cents,
                        customer_name, customer_phone, customer_email,
                        vehicle_make, vehicle_model, vehicle_year, extra_info, status
                    )
                    VALUES (
                        ${retryNumber}, ${hold.service_id}, ${hold.vehicle_size}, ${hold.cleaning_type}, ${hold.addon_ids},
                        ${hold.booking_date}, ${hold.start_time}, ${hold.end_time}, ${priceCents},
                        ${customerName}, ${phone}, ${email},
                        ${vehicleMake || null}, ${vehicleModel || null}, ${vehicleYear ? parseInt(vehicleYear) : null},
                        ${extraInfo || null}, 'confirmed'
                    )
                    RETURNING booking_number
                `;

                inserted = rows[0];

            } else {

                throw error;
            }
        }


        await sql`DELETE FROM holds WHERE id = ${holdId}`;

        res.status(200).json({ bookingNumber: inserted.booking_number });

    } catch (error) {

        console.error("Erreur /api/bookings/confirm:", error);

        res.status(500).json({ error: error.message || "Erreur serveur inconnue" });
    }
};