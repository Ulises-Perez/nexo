import { Router } from 'express';
import { FriendController } from '../controllers/friend.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import { sendRequestSchema, requestIdParams, userIdParams, channelIdParams } from '../schemas/friend.schema';

const router = Router();

// POST /friends/request - Send a friend request
router.post('/request', requireAuth, validate({ body: sendRequestSchema }), FriendController.sendRequest);

// PATCH /friends/request/:id/accept - Accept a request
router.patch('/request/:id/accept', requireAuth, validate({ params: requestIdParams }), FriendController.acceptRequest);

// PATCH /friends/request/:id/reject - Reject a request
router.patch('/request/:id/reject', requireAuth, validate({ params: requestIdParams }), FriendController.rejectRequest);

// GET /friends/requests/pending - List pending received requests
router.get('/requests/pending', requireAuth, FriendController.getPendingRequests);

// GET /friends - List the current user's friends
router.get('/', requireAuth, FriendController.getFriends);

// GET /friends/status/:userId - Relationship status with another user
router.get('/status/:userId', requireAuth, validate({ params: userIdParams }), FriendController.getFriendStatus);

// DELETE /friends/:userId - Remove a friend
router.delete('/:userId', requireAuth, validate({ params: userIdParams }), FriendController.removeFriend);

// POST /friends/dm/:userId - Get or create a DM conversation
router.post('/dm/:userId', requireAuth, validate({ params: userIdParams }), FriendController.getOrCreateDM);

// GET /friends/dm/conversations - List all DM conversations
router.get('/dm/conversations', requireAuth, FriendController.getDMConversations);

// PATCH /friends/dm/conversations/:channelId/hide - Hide a DM conversation for the current user
router.patch('/dm/conversations/:channelId/hide', requireAuth, validate({ params: channelIdParams }), FriendController.hideDMConversation);

export default router;
