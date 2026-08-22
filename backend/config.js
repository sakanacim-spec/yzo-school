// ============================================================
// CONFIGURATION GLOBALE DU BACKEND
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || typeof JWT_SECRET !== 'string' || JWT_SECRET.trim().length < 32) {
    console.error('CONFIGURATION_INVALIDE: JWT_SECRET doit comporter au moins 32 caractères.');
    process.exitCode = 1;
    throw new Error('CONFIGURATION_INVALIDE: JWT_SECRET manquant ou insuffisant (min 32 caractères).');
}

module.exports = {
    PORT: process.env.PORT || 3001,
    JWT_SECRET: JWT_SECRET.trim(),
    JWT_EXPIRES: '7d',
};
