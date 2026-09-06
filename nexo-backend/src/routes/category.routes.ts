import { Router } from 'express';
import { ChannelController } from '../controllers/channel.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import { updateCategorySchema } from '../schemas/channel.schema';

const router = Router();

// Endpoint: PATCH /api/categories/:id (Renombrar categoría)
router.patch('/:id', requireAuth, validate({ body: updateCategorySchema }), ChannelController.updateCategory);

// Endpoint: DELETE /api/categories/:id (Eliminar categoría y sus canales)
router.delete('/:id', requireAuth, ChannelController.deleteCategory);

export default router;
