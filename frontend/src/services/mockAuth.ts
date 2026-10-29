export type MockAuthRole = 'admin';

export type MockAuthUser = {
  id: string;
  email: string;
  name: string;
  role: MockAuthRole;
};

export type MockAuthResult =
  | { ok: true; user: MockAuthUser }
  | { ok: false; reason: 'disabled' | 'missing-fields' | 'invalid-credentials' };

// Expo/React Native compiles __DEV__ to false in production builds.
// This is a demo gate, not an authentication security boundary.
export const isMockAuthEnabled = __DEV__;

const adminAccount = {
  email: 'admin@goplant.test',
  password: 'Admin123!',
  user: {
    id: 'mock-admin-001',
    email: 'admin@goplant.test',
    name: 'GoPlant Admin',
    role: 'admin' as const,
  },
};

export async function authenticateWithMockAuth(email: string, password: string): Promise<MockAuthResult> {
  if (!isMockAuthEnabled) return { ok: false, reason: 'disabled' };
  if (!email.trim() || !password) return { ok: false, reason: 'missing-fields' };

  // Keep the loading state visible briefly so the demo form can exercise it.
  await new Promise<void>((resolve) => setTimeout(resolve, 300));

  if (email.trim().toLowerCase() !== adminAccount.email || password !== adminAccount.password) {
    return { ok: false, reason: 'invalid-credentials' };
  }

  return { ok: true, user: { ...adminAccount.user } };
}
