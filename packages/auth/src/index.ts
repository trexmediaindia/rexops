import * as schema from "@rexops/db";
import { db } from "@rexops/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements as adminStatements } from "better-auth/plugins/admin/access";

const adminAccess = createAccessControl(adminStatements);
const regularRole = adminAccess.newRole({});
const superAdminRole = adminAccess.newRole({
  ...adminAc.statements,
  user: ["impersonate-admins", ...adminAc.statements.user],
});

export const auth = betterAuth({
  appName: "RexOps",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "development-secret-replace-before-production",
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:5173"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.invitations,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "AGENCY_MEMBER",
        input: false,
      },
      specialty: {
        type: "string",
        required: false,
        input: false,
      },
      agencyId: {
        type: "string",
        required: false,
        input: false,
      },
      clientId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    organization(),
    admin({
      ac: adminAccess,
      defaultRole: "AGENCY_MEMBER",
      roles: {
        SUPER_ADMIN: superAdminRole,
        AGENCY_OWNER: regularRole,
        AGENCY_ADMIN: regularRole,
        AGENCY_MEMBER: regularRole,
        CLIENT_OWNER: regularRole,
        CLIENT_MEMBER: regularRole,
      },
    }),
  ],
});

export type Auth = typeof auth;
