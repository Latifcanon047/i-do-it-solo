import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

import prisma from "@/lib/prisma";

class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        // User daftar via Google doang, belum punya password — tolak login manual
        if (!user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );

        if (!isValid) return null;

        if (!user.emailVerified) {
          throw new EmailNotVerifiedError();
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Cuma proses logic khusus buat provider Google
      if (account?.provider !== "google") return true;

      if (!user.email) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!existingUser) {
        // Belum pernah daftar sama sekali — bikin User baru
        await prisma.user.create({
          data: {
            name: user.name ?? user.email.split("@")[0],
            email: user.email,
            googleId: account.providerAccountId,
            emailVerified: new Date(),
          },
        });
        return true;
      }

      if (!existingUser.googleId) {
        // Auto-merge silent: akun manual lama disambungin ke Google
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: account.providerAccountId,
            emailVerified: existingUser.emailVerified ?? new Date(),
          },
        });
      }

      return true;
    },
    async jwt({ token, user, account }) {
      // Login baru — user object ada
      if (user) {
        if (account?.provider === "google" && user.email) {
          // id dari objek OAuth Google BUKAN id Prisma kita — lookup dulu
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true },
          });
          token.id = dbUser?.id;
        } else {
          token.id = user.id;
        }
        return token;
      }

      // Request selanjutnya — pastiin user masih exist di DB
      if (token.id) {
        const exists = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { id: true },
        });

        if (!exists) {
          // User udah dihapus dari DB — invalidate session
          return null;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (token) session.user.id = token.id as string;
      return session;
    },
  },
});
