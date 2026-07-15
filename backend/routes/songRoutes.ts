import { Router } from 'express';
import { getSongs, createSong } from '../controllers/songController';

const router = Router();

router.get('/', getSongs);
router.post('/', createSong); // For adding initial data

export default router;
