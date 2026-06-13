// ============================================================
// CONFIGURATION GLOBALE DU BACKEND
// ============================================================

module.exports = {
    PORT: process.env.PORT || 3001,
    JWT_SECRET: process.env.JWT_SECRET || 'edufinance_secret_jwt_2025',
    JWT_EXPIRES: '7d',
};
