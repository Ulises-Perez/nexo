import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';
import { registerSchema, loginSchema } from '../schemas/auth.schema';

const router = Router();

// Endpoint: POST /api/auth/register
router.post('/register', validate({ body: registerSchema }), AuthController.register);

// Endpoint: POST /api/auth/login
router.post('/login', validate({ body: loginSchema }), AuthController.login);

export default router;
