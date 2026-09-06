export { };

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
            };
        }
    }
}

// Express 5's req.query is a getter-only property, so validate() stores
// parsed params/query on res.locals instead of mutating req directly.
declare module 'express-serve-static-core' {
    interface Locals {
        params?: any;
        query?: any;
    }
}
