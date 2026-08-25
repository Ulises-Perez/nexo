import { Router } from 'express';
import { UpdatesController } from '../controllers/updates.controller';

const router = Router();

// Endpoint: GET /api/updates/download/:tag/:assetName
// Registered before the generic manifest route below so the literal
// "download" segment isn't swallowed by the :target param.
router.get('/download/:tag/:assetName', UpdatesController.downloadAsset);

// Endpoint: GET /api/updates/:target/:arch/:currentVersion
router.get('/:target/:arch/:currentVersion', UpdatesController.getManifest);

export default router;
