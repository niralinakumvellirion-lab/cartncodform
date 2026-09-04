import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import jwt from 'jsonwebtoken';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const secret = process.env.BACKEND_JWT_SECRET;
  if (!secret) {
    console.error('[token] BACKEND_JWT_SECRET not configured');
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const token = jwt.sign(
    { email: session.user.email },
    secret,
    { expiresIn: '15m', issuer: 'cartncodform-frontend' }
  );

  return Response.json({ token });
}
