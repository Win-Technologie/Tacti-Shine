/*
    lib/pricing.js

    Les modificateurs de durée par taille de véhicule et
    type de nettoyage ne sont PAS encore en base de données
    (seule la grille de prix l'est, via service_pricing).
    Ce fichier centralise ces constantes pour que le serveur
    calcule la même durée que le client — jamais confiance
    en une durée envoyée par le navigateur.

    Si un jour tu rends ça modifiable depuis l'admin, il
    faudra migrer ces valeurs vers des colonnes en base et
    remplacer ce fichier par des requêtes SQL.
*/

const VEHICLE_DURATION_ADD = {
    small: 0,
    big: 1
};

const CLEANING_DURATION_MULTIPLIER = {
    interior: 0.6,
    exterior: 0.6,
    complete: 1
};


/*
    computeDuration

    baseDurationHours : la durée de base du forfait (services.base_duration_minutes / 60)
    vehicleSize        : "small" | "big" | null (null pour un forfait à prix fixe)
    cleaningType        : "interior" | "exterior" | "complete" | null
    addonDurationHours : somme des durées des add-ons choisis (en heures)

    Retourne la durée totale en heures, arrondie à la
    demi-heure la plus proche, avec un minimum de 1h.
*/

function computeDuration(baseDurationHours, vehicleSize, cleaningType, addonDurationHours = 0) {

    let duration = baseDurationHours;

    if (vehicleSize && cleaningType) {

        const durationAdd = VEHICLE_DURATION_ADD[vehicleSize];
        const durationMultiplier = CLEANING_DURATION_MULTIPLIER[cleaningType];

        if (durationAdd === undefined || durationMultiplier === undefined) {
            throw new Error("Taille de véhicule ou type de nettoyage invalide");
        }

        duration = baseDurationHours * durationMultiplier + durationAdd;
    }

    duration += addonDurationHours;

    const rounded = Math.round(duration * 2) / 2;

    return Math.max(1, rounded);
}


module.exports = {
    VEHICLE_DURATION_ADD,
    CLEANING_DURATION_MULTIPLIER,
    computeDuration
};