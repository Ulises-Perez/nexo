import { Router } from 'express';
import { CommunityController } from '../controllers/community.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// Endpoint: POST /api/invites/:code/join
router.post('/:code/join', requireAuth, CommunityController.joinCommunity);

// Endpoint: GET /api/invites/:code
router.get('/:code', CommunityController.getInviteInfo);

export default router;
