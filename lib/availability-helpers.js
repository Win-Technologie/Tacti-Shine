/*
    lib/availability-helpers.js

    Logique partagée entre /api/availability et /api/holds
    pour déterminer quels créneaux sont réellement libres
    un jour donné : heures d'ouverture moins (réservations
    + holds actifs + heures bloquées).
*/

const { sql } = require("@vercel/postgres");


function timeToMinutes(timeStr) {
    // "09:30:00" ou "09:30" -> 570
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

function minutesToTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function overlaps(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
}


/*
    getBusinessHoursMinutes

    Retourne { startMin, endMin } pour ce jour de la
    semaine (0 = dimanche ... 6 = samedi), ou null si
    fermé ce jour-là.
*/

async function getBusinessHoursMinutes(dayOfWeek) {

    const { rows } = await sql`
        SELECT start_time, end_time
        FROM business_hours
        WHERE day_of_week = ${dayOfWeek}
    `;

    if (rows.length === 0) {
        return null;
    }

    return {
        startMin: timeToMinutes(rows[0].start_time),
        endMin: timeToMinutes(rows[0].end_time)
    };
}


/*
    isDayFullyBlocked

    true si un blocage "journée complète" (start_time
    NULL) existe pour cette date.
*/

async function isDayFullyBlocked(date) {

    const { rows } = await sql`
        SELECT 1 FROM blocked_times
        WHERE blocked_date = ${date}
          AND start_time IS NULL
        LIMIT 1
    `;

    return rows.length > 0;
}


/*
    getBusyIntervals

    Combine réservations confirmées + holds actifs
    (non expirés) + blocages partiels pour cette date,
    et retourne un tableau de [startMin, endMin].
*/

async function getBusyIntervals(date) {

    const intervals = [];

    const { rows: bookingRows } = await sql`
        SELECT start_time, end_time FROM bookings
        WHERE booking_date = ${date}
          AND status != 'cancelled'
    `;

    bookingRows.forEach(row => {
        intervals.push([
            timeToMinutes(row.start_time),
            timeToMinutes(row.end_time)
        ]);
    });

    const { rows: holdRows } = await sql`
        SELECT start_time, end_time FROM holds
        WHERE booking_date = ${date}
          AND expires_at > now()
    `;

    holdRows.forEach(row => {
        intervals.push([
            timeToMinutes(row.start_time),
            timeToMinutes(row.end_time)
        ]);
    });

    const { rows: blockRows } = await sql`
        SELECT start_time, end_time FROM blocked_times
        WHERE blocked_date = ${date}
          AND start_time IS NOT NULL
    `;

    blockRows.forEach(row => {
        intervals.push([
            timeToMinutes(row.start_time),
            timeToMinutes(row.end_time)
        ]);
    });

    return intervals;
}


/*
    generateAvailableSlots

    Génère les heures de départ possibles (par pas de 30
    minutes) qui rentrent dans les heures d'ouverture et
    qui n'entrent en conflit avec aucun intervalle occupé.
*/

function generateAvailableSlots(businessHours, durationMinutes, busyIntervals, stepMinutes = 30) {

    const slots = [];

    for (
        let start = businessHours.startMin;
        start + durationMinutes <= businessHours.endMin;
        start += stepMinutes
    ) {

        const end = start + durationMinutes;

        const isBusy = busyIntervals.some(
            ([busyStart, busyEnd]) => overlaps(start, end, busyStart, busyEnd)
        );

        if (!isBusy) {
            slots.push(minutesToTime(start));
        }
    }

    return slots;
}


/*
    isSlotAvailable

    Vérifie qu'un créneau précis (startMin -> startMin +
    durationMinutes) est toujours libre — utilisé par
    /api/holds juste avant de créer le verrouillage, pour
    éviter qu'un autre client prenne le même créneau entre
    temps.
*/

function isSlotAvailable(businessHours, startMin, durationMinutes, busyIntervals) {

    const endMin = startMin + durationMinutes;

    if (startMin < businessHours.startMin || endMin > businessHours.endMin) {
        return false;
    }

    return !busyIntervals.some(
        ([busyStart, busyEnd]) => overlaps(startMin, endMin, busyStart, busyEnd)
    );
}


module.exports = {
    timeToMinutes,
    minutesToTime,
    overlaps,
    getBusinessHoursMinutes,
    isDayFullyBlocked,
    getBusyIntervals,
    generateAvailableSlots,
    isSlotAvailable
};