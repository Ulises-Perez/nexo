import { Router } from 'express';
import { AttachmentController } from '../controllers/attachment.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// Endpoint: POST /api/attachments/presign
router.post('/presign', requireAuth, AttachmentController.presign);

export default router;
