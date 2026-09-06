import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import { idParam } from '../lib/validation';
import { updateMeSchema, searchQuerySchema, addConnectionSchema } from '../schemas/user.schema';

const router = Router();

// Endpoint: GET /api/users/me
router.get('/me', requireAuth, UserController.getMe);

// Endpoint: PATCH /api/users/me (update profile)
router.patch('/me', requireAuth, validate({ body: updateMeSchema }), UserController.updateMe);

// Endpoint: POST /api/users/me/connections (add connection)
router.post(
    '/me/connections',
    requireAuth,
    validate({ body: addConnectionSchema }),
    UserController.addConnection
);

// Endpoint: DELETE /api/users/me/connections/:id (remove connection)
router.delete(
    '/me/connections/:id',
    requireAuth,
    validate({ params: idParam }),
    UserController.removeConnection
);

// Endpoint: GET /api/users/search?q=username
router.get('/search', requireAuth, validate({ query: searchQuerySchema }), UserController.search);

// Endpoint: GET /api/users/:id/mutual-friends
router.get(
    '/:id/mutual-friends',
    requireAuth,
    validate({ params: idParam }),
    UserController.getMutualFriends
);

// Endpoint: GET /api/users/:id/mutual-communities
router.get(
    '/:id/mutual-communities',
    requireAuth,
    validate({ params: idParam }),
    UserController.getMutualCommunities
);

// Endpoint: GET /api/users/:id/profile-card — profile + both "in common"
// lists in a single round-trip (used by the DM user card).
router.get(
    '/:id/profile-card',
    requireAuth,
    validate({ params: idParam }),
    UserController.getProfileCard
);

// Endpoint: GET /api/users/:id
router.get('/:id', requireAuth, validate({ params: idParam }), UserController.getById);

export default router;
