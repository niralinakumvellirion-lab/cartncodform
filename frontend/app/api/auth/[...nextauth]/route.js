import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Exported so server-side code (lib/session.js) can call
// getServerSession(authOptions) with the same config.
export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) session.user.email = token.email;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
