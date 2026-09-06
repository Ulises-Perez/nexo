import { Router } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import { updateChannelSchema, getMessagesQuerySchema } from '../schemas/channel.schema';

const router = Router();

// Endpoint: GET /api/channels/:id/messages
router.get('/:id/messages', requireAuth, validate({ query: getMessagesQuerySchema }), ChannelController.getMessages);

// Endpoint: PATCH /api/channels/:id (Renombrar canal)
router.patch('/:id', requireAuth, validate({ body: updateChannelSchema }), ChannelController.updateChannel);

// Endpoint: DELETE /api/channels/:id (Eliminar canal)
router.delete('/:id', requireAuth, ChannelController.deleteChannel);

export default router;
