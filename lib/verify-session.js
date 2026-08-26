/*
    lib/verify-session.js

    Crée et vérifie un token de session signé (HMAC),
    sans dépendance externe (juste le module "crypto"
    intégré à Node).

    Le token n'est jamais stocké côté serveur : sa
    signature suffit à prouver qu'il a été émis par
    /api/admin/login et qu'il n'a pas expiré.
*/

const crypto = require("crypto");

const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 heures


function createSessionToken() {

    const payload = JSON.stringify({
        admin: true,
        iat: Date.now()
    });

    const payloadBase64 =
        Buffer.from(payload).toString("base64url");

    const signature = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(payloadBase64)
        .digest("base64url");

    return `${payloadBase64}.${signature}`;
}


function verifySessionToken(token) {

    if (!token) {
        return false;
    }

    const [payloadBase64, signature] = token.split(".");

    if (!payloadBase64 || !signature) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(payloadBase64)
        .digest("base64url");

    // Longueurs différentes = timingSafeEqual plante, donc on
    // vérifie ça avant (ça ne fuit aucune info utile en soi).
    if (signature.length !== expectedSignature.length) {
        return false;
    }

    const isValidSignature = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );

    if (!isValidSignature) {
        return false;
    }

    let payload;

    try {
        payload = JSON.parse(
            Buffer.from(payloadBase64, "base64url").toString()
        );
    } catch {
        return false;
    }

    const isExpired =
        Date.now() - payload.iat > SESSION_MAX_AGE_MS;

    return !isExpired;
}


function getSessionCookie(req) {

    const cookieHeader = req.headers.cookie || "";

    const cookies = Object.fromEntries(
        cookieHeader
            .split(";")
            .filter(Boolean)
            .map(entry => {
                const [key, ...rest] = entry.trim().split("=");
                return [key, rest.join("=")];
            })
    );

    return cookies.admin_session;
}


function isAuthenticated(req) {
    return verifySessionToken(getSessionCookie(req));
}


module.exports = {
    createSessionToken,
    verifySessionToken,
    getSessionCookie,
    isAuthenticated
};
