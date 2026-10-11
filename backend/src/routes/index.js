import { Router } from 'express';
import authRoutes from './authRoutes.js';
import studentRoutes from './studentRoutes.js';
import adminRoutes from './adminRoutes.js';
import { getConfig } from '../controllers/metaController.js';

const router = Router();

// Root endpoint: doubles as the platform health check (Render, uptime pings).
router.get('/', (req, res) => res.send('LearnPrep API'));

// Public metadata (allowed classes, pass mark) for the register + admin forms.
router.get('/config', getConfig);

router.use('/auth', authRoutes);
router.use('/', studentRoutes);
router.use('/admin', adminRoutes);

export default router;
