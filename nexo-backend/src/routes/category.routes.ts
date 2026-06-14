import { Router } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// Endpoint: PATCH /api/categories/:id (Renombrar categoría)
router.patch('/:id', requireAuth, ChannelController.updateCategory);

// Endpoint: DELETE /api/categories/:id (Eliminar categoría y sus canales)
router.delete('/:id', requireAuth, ChannelController.deleteCategory);

export default router;
