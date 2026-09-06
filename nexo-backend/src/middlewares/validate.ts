// Declarative zod validation middleware, used per-route:
//   router.post('/', validate({ body: createXSchema }), controller.x)
//
// Body is replaced in place (so .trim()/defaults/coercions apply downstream).
// Express 5's req.query is a getter-only property, so params/query results
// are stored on res.locals instead (see src/types/express.d.ts).

import { RequestHandler } from 'express';
import { ZodTypeAny } from 'zod';

export function validate(schemas: {
    body?: ZodTypeAny;
    params?: ZodTypeAny;
    query?: ZodTypeAny;
}): RequestHandler {
    return (req, res, next) => {
        if (schemas.body) {
            const result = schemas.body.safeParse(req.body);
            if (!result.success) {
                next(result.error);
                return;
            }
            req.body = result.data;
        }

        if (schemas.params) {
            const result = schemas.params.safeParse(req.params);
            if (!result.success) {
                next(result.error);
                return;
            }
            res.locals.params = result.data;
        }

        if (schemas.query) {
            const result = schemas.query.safeParse(req.query);
            if (!result.success) {
                next(result.error);
                return;
            }
            res.locals.query = result.data;
        }

        next();
    };
}
