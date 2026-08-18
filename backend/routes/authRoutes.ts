import { Router, Request, Response, NextFunction } from 'express';
import { requestOtp, verifyOtp, readSession } from '../lib/otpAuth';
import { getUserByEmail, saveUserData, setUserName } from '../lib/userAccount';
import { rateLimit } from '../lib/rateLimit';

const router = Router();

router.use(rateLimit(60_000, 30));

const bearer = (req: Request) => {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};

const requireEmail = (req: Request, res: Response, next: NextFunction) => {
  const session = readSession(bearer(req));
  if (!session?.email) {
    res.status(401).json({ message: 'Please sign in again.' });
    return;
  }
  (req as Request & { email: string }).email = session.email;
  next();
};

router.post('/otp', async (req: Request, res: Response) => {
  try {
    const result = await requestOtp(req.body?.email);
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }
    res.json({
      ok: true,
      email: result.email,
      wait: result.wait,
      ...(result.previewOtp ? { previewOtp: result.previewOtp } : {}),
    });
  } catch (error) {
    console.error('OTP send failed', error);
    res.status(502).json({ message: 'Could not send the code. Try again.' });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const result = await verifyOtp(req.body?.email, req.body?.otp);
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }
    res.json({
      ok: true,
      email: result.email,
      name: result.name,
      isNew: result.isNew,
      token: result.token,
    });
  } catch (error) {
    console.error('OTP verify failed', error);
    res.status(500).json({ message: 'Could not verify the code.' });
  }
});

router.post('/name', requireEmail, async (req: Request, res: Response) => {
  const email = (req as Request & { email: string }).email;
  const user = await setUserName(email, req.body?.name);
  if (!user) {
    res.status(400).json({ message: 'Enter your name (at least 2 letters).' });
    return;
  }
  res.json({ ok: true, email: user.email, name: user.name });
});

router.get('/me', requireEmail, async (req: Request, res: Response) => {
  const email = (req as Request & { email: string }).email;
  const user = await getUserByEmail(email);
  if (!user) {
    res.status(401).json({ message: 'Please sign in again.' });
    return;
  }
  const name = String(user.name || '').trim();
  res.json({ ok: true, email: user.email, name, isNew: !name });
});

router.get('/data', requireEmail, async (req: Request, res: Response) => {
  const email = (req as Request & { email: string }).email;
  const user = await getUserByEmail(email);
  res.json({ ok: true, email, name: user?.name || '', data: user?.data || {} });
});

router.put('/data', requireEmail, async (req: Request, res: Response) => {
  const email = (req as Request & { email: string }).email;
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    res.status(400).json({ message: 'Missing data.' });
    return;
  }
  await saveUserData(email, data);
  res.json({ ok: true, email });
});

router.post('/logout', requireEmail, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
