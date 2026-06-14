import { Router } from 'express';
import { CommunityController } from '../controllers/community.controller';
import { ChannelController } from '../controllers/channel.controller';
import { RoleController } from '../controllers/role.controller';
import { MemberController } from '../controllers/member.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// Endpoint: GET /api/communities
router.get('/', requireAuth, CommunityController.getUserCommunities);

// Endpoint: POST /api/communities (Crear comunidad)
router.post('/', requireAuth, CommunityController.createCommunity);

// Endpoint: PATCH /api/communities/:id (Editar comunidad)
router.patch('/:id', requireAuth, CommunityController.updateCommunity);

// Endpoint: DELETE /api/communities/:id (Eliminar comunidad)
router.delete('/:id', requireAuth, CommunityController.deleteCommunity);

// Endpoint: POST /api/communities/:id/invite (Generar código)
router.post('/:id/invite', requireAuth, CommunityController.generateInviteCode);

// Endpoint: DELETE /api/communities/:id/leave (Salir de comunidad)
router.delete('/:id/leave', requireAuth, CommunityController.leaveCommunity);

// Canales y categorías
router.post('/:id/channels', requireAuth, ChannelController.createChannel);
router.post('/:id/categories', requireAuth, ChannelController.createCategory);

// Roles
router.get('/:id/roles', requireAuth, RoleController.getRoles);
router.post('/:id/roles', requireAuth, RoleController.createRole);
router.patch('/:id/roles/:roleId', requireAuth, RoleController.updateRole);
router.delete('/:id/roles/:roleId', requireAuth, RoleController.deleteRole);

// Miembros y moderación
router.get('/:id/members', requireAuth, MemberController.getMembers);
router.put('/:id/members/:userId/roles', requireAuth, RoleController.setMemberRoles);
router.delete('/:id/members/:userId', requireAuth, MemberController.kickMember);
router.get('/:id/bans', requireAuth, MemberController.getBans);
router.post('/:id/bans', requireAuth, MemberController.banMember);
router.delete('/:id/bans/:userId', requireAuth, MemberController.unbanMember);

export default router;
