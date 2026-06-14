import { Router } from 'express';
import { FriendController } from '../controllers/friend.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// POST /friends/request - Enviar solicitud de amistad
router.post('/request', requireAuth, FriendController.sendRequest);

// PATCH /friends/request/:id/accept - Aceptar solicitud
router.patch('/request/:id/accept', requireAuth, FriendController.acceptRequest);

// PATCH /friends/request/:id/reject - Rechazar solicitud
router.patch('/request/:id/reject', requireAuth, FriendController.rejectRequest);

// GET /friends/requests/pending - Listar solicitudes pendientes recibidas
router.get('/requests/pending', requireAuth, FriendController.getPendingRequests);

// GET /friends - Listar amigos del usuario actual
router.get('/', requireAuth, FriendController.getFriends);

// GET /friends/status/:userId - Estado de la relación con otro usuario
router.get('/status/:userId', requireAuth, FriendController.getFriendStatus);

// DELETE /friends/:userId - Eliminar amigo
router.delete('/:userId', requireAuth, FriendController.removeFriend);

// POST /friends/dm/:userId - Obtener o crear conversación DM
router.post('/dm/:userId', requireAuth, FriendController.getOrCreateDM);

// GET /friends/dm/conversations - Listar todas las conversaciones DM
router.get('/dm/conversations', requireAuth, FriendController.getDMConversations);

// PATCH /friends/dm/conversations/:channelId/hide - Ocultar una conversación DM para el usuario actual
router.patch('/dm/conversations/:channelId/hide', requireAuth, FriendController.hideDMConversation);

export default router;
