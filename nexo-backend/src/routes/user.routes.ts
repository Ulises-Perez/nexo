import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// Endpoint: GET /api/users/me
router.get('/me', requireAuth, UserController.getMe);

// Endpoint: PATCH /api/users/me (Actualizar perfil)
router.patch('/me', requireAuth, UserController.updateMe);

// Endpoint: POST /api/users/me/connections (Agregar conexión)
router.post('/me/connections', requireAuth, UserController.addConnection);

// Endpoint: DELETE /api/users/me/connections/:id (Eliminar conexión)
router.delete('/me/connections/:id', requireAuth, UserController.removeConnection);

// Endpoint: GET /api/users/search?q=username
router.get('/search', requireAuth, UserController.search);

// Endpoint: GET /api/users/:id/mutual-friends (Amigos en común)
router.get('/:id/mutual-friends', requireAuth, UserController.getMutualFriends);

// Endpoint: GET /api/users/:id/mutual-communities (Comunidades en común)
router.get('/:id/mutual-communities', requireAuth, UserController.getMutualCommunities);

// Endpoint: GET /api/users/:id/profile-card — perfil + ambos "en común" en un
// solo round-trip (usado por la tarjeta de usuario en DMs).
router.get('/:id/profile-card', requireAuth, UserController.getProfileCard);

// Endpoint: GET /api/users/:id
router.get('/:id', requireAuth, UserController.getById);

export default router;
