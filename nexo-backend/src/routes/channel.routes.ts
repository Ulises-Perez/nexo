import { Router } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// Endpoint: GET /api/channels/:id/messages
router.get('/:id/messages', requireAuth, ChannelController.getMessages);

// Endpoint: PATCH /api/channels/:id (Renombrar canal)
router.patch('/:id', requireAuth, ChannelController.updateChannel);

// Endpoint: DELETE /api/channels/:id (Eliminar canal)
router.delete('/:id', requireAuth, ChannelController.deleteChannel);

export default router;
