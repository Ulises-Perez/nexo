import { Router } from 'express';
import { PingController } from '../controllers/ping.controller';

const router = Router();

// Endpoint: GET /api/ping
router.get('/', PingController.ping);

export default router;
