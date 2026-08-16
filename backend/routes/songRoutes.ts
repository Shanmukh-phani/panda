import { Router, Request, Response, NextFunction } from 'express';
import { getSongs, createSong, getSongMeta, getSongById, refreshSongs } from '../controllers/songController';

const router = Router();

const adminGuard = (req: Request, res: Response, next: NextFunction) => {
  const key = String(process.env.ADMIN_KEY || '').trim();
  if (!key) {
    res.status(403).json({ message: 'Catalog writes are disabled' });
    return;
  }
  if (String(req.headers['x-admin-key'] || '') !== key) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  next();
};

router.get('/', getSongs);
router.get('/meta', getSongMeta);
router.post('/refresh-meta', adminGuard, refreshSongs);
router.get('/:id', getSongById);
router.post('/', adminGuard, createSong);

export default router;
