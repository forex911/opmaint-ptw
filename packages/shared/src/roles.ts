export const UserRole = {
  REQUESTER: 'REQUESTER',
  AREA_OWNER: 'AREA_OWNER',
  SAFETY_OFFICER: 'SAFETY_OFFICER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ALL_USER_ROLES: readonly UserRole[] = [
  UserRole.REQUESTER,
  UserRole.AREA_OWNER,
  UserRole.SAFETY_OFFICER,
  UserRole.ADMIN,
] as const;
