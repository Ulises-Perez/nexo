// Allowed browser origins, shared by the HTTP API and the Socket.IO server.
// With no CORS_ORIGINS configured everything is blocked (fail closed).
export const corsOrigins: string[] = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
