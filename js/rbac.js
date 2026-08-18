import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const ADMIN_AREAS = [
  { id: 'community', label: 'Community projects', description: 'Review project submissions and selection requests.' },
  { id: 'market', label: 'Market & Stores', description: 'Manage market stores, items, and store admins.' },
  { id: 'events', label: 'Events', description: 'View or manage chapter events.' },
  { id: 'articles', label: 'Magazine', description: 'View or manage magazine articles.' },
  { id: 'library', label: 'Library', description: 'View or manage library resources.' },
  { id: 'models3d', label: '3D models', description: 'View or manage uploaded 3D models.' },
  { id: 'fbd', label: 'Freedom by Design', description: 'View or manage FBD content and events.' }
];

export const DEFAULT_ROLES = {
  super_admin: {
    name: 'Super Admin',
    description: 'Complete access, including roles and user assignments.',
    permissions: ['*'],
    builtIn: true
  },
  content_manager: {
    name: 'Content Manager',
    description: 'Manages website content and can view community project requests.',
    permissions: ['view_community', 'manage_market', 'manage_events', 'manage_articles', 'manage_library', 'manage_models3d', 'manage_fbd'],
    builtIn: true
  },
  community_manager: {
    name: 'Community Manager',
    description: 'Reviews and manages community project submissions.',
    permissions: ['manage_community'],
    builtIn: true
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only access to every administration area.',
    permissions: ADMIN_AREAS.map(area => `view_${area.id}`),
    builtIn: true
  }
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function canManage(access, area) {
  const permissions = access?.permissions || [];
  return Boolean(access?.isSuperAdmin || permissions.includes('*') || permissions.includes(`manage_${area}`));
}

export function canView(access, area) {
  const permissions = access?.permissions || [];
  return Boolean(canManage(access, area) || permissions.includes(`view_${area}`));
}

export function persistAccessSession(access) {
  localStorage.setItem('aias_is_admin', access?.allowed ? 'true' : 'false');
  localStorage.setItem('aias_is_super_admin', access?.isSuperAdmin ? 'true' : 'false');
  localStorage.setItem('aias_admin_role', access?.roleId || '');
  localStorage.setItem('aias_admin_role_name', access?.role?.name || '');
  localStorage.setItem('aias_admin_permissions', JSON.stringify(access?.permissions || []));
}

export function clearAccessSession() {
  ['aias_is_admin', 'aias_is_super_admin', 'aias_admin_role', 'aias_admin_role_name', 'aias_admin_permissions'].forEach(key => localStorage.removeItem(key));
}

export async function getAdminAccess(db, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { allowed:false, isSuperAdmin:false, roleId:null, role:null, permissions:[], roles:{...DEFAULT_ROLES}, assignments:{}, legacyAdmins:[] };

  const [adminsSnapshot, rolesSnapshot, assignmentsSnapshot] = await Promise.all([
    getDoc(doc(db, 'config', 'admins')).catch(() => null),
    getDoc(doc(db, 'config', 'roles')).catch(() => null),
    getDoc(doc(db, 'config', 'userRoles')).catch(() => null)
  ]);
  const legacyAdmins = adminsSnapshot?.exists?.() && Array.isArray(adminsSnapshot.data().admins)
    ? adminsSnapshot.data().admins.map(normalizeEmail)
    : [];
  const storedRoles = rolesSnapshot?.exists?.() && rolesSnapshot.data().roles && typeof rolesSnapshot.data().roles === 'object'
    ? rolesSnapshot.data().roles
    : {};
  const roles = { ...DEFAULT_ROLES, ...storedRoles };
  const assignments = assignmentsSnapshot?.exists?.() && assignmentsSnapshot.data().assignments && typeof assignmentsSnapshot.data().assignments === 'object'
    ? assignmentsSnapshot.data().assignments
    : {};
  const isLegacyAdmin = legacyAdmins.includes(normalizedEmail);
  const assignedRoleId = normalizeEmail(assignments[normalizedEmail] || '').replace(/[^a-z0-9_-]/g, '');
  const roleId = isLegacyAdmin ? 'super_admin' : (assignedRoleId || null);
  const role = roleId ? roles[roleId] : null;
  const permissions = Array.isArray(role?.permissions) ? [...new Set(role.permissions.map(String))] : [];
  const isSuperAdmin = isLegacyAdmin || roleId === 'super_admin' || permissions.includes('*');
  return {
    allowed: Boolean(isSuperAdmin || (role && permissions.length)),
    isSuperAdmin,
    isLegacyAdmin,
    roleId,
    role: isSuperAdmin ? roles.super_admin : role,
    permissions: isSuperAdmin ? ['*'] : permissions,
    roles,
    assignments,
    legacyAdmins
  };
}

export async function ensureRoleConfiguration(db, access, actorEmail) {
  if (!access?.isSuperAdmin) return access;
  try {
    const roles = { ...DEFAULT_ROLES, ...(access.roles || {}) };
    if (access.legacyAdmins?.length) {
      await setDoc(doc(db, 'config', 'admins'), { admins:[...new Set((access.legacyAdmins || []).map(normalizeEmail))] }, { merge:true }).catch(console.warn);
    }
    await setDoc(doc(db, 'config', 'roles'), { roles, updatedAt:serverTimestamp(), updatedBy:normalizeEmail(actorEmail) }, { merge:true }).catch(console.warn);
    const assignmentsSnapshot = await getDoc(doc(db, 'config', 'userRoles')).catch(() => null);
    if (assignmentsSnapshot && !assignmentsSnapshot.exists()) {
      await setDoc(doc(db, 'config', 'userRoles'), { assignments:{}, updatedAt:serverTimestamp(), updatedBy:normalizeEmail(actorEmail) }).catch(console.warn);
    }
  } catch (err) {
    console.warn('[RBAC] ensureRoleConfiguration soft fallback:', err);
  }
  return access;
}

export async function saveRoles(db, roles, actorEmail) {
  const safeRoles = { ...DEFAULT_ROLES };
  Object.entries(roles || {}).forEach(([id, role]) => {
    if (!/^[a-z0-9_-]{2,48}$/.test(id) || id === 'super_admin') return;
    safeRoles[id] = {
      name:String(role?.name || '').trim().slice(0,80),
      description:String(role?.description || '').trim().slice(0,240),
      permissions:[...new Set((role?.permissions || []).map(String).filter(permission => /^(view|manage)_(community|events|articles|library|models3d|fbd)$/.test(permission)))],
      builtIn:Boolean(DEFAULT_ROLES[id]?.builtIn)
    };
  });
  await setDoc(doc(db, 'config', 'roles'), { roles:safeRoles, updatedAt:serverTimestamp(), updatedBy:normalizeEmail(actorEmail) });
  return safeRoles;
}

export async function saveAssignments(db, assignments, actorEmail) {
  const safeAssignments = {};
  Object.entries(assignments || {}).forEach(([email, roleId]) => {
    const normalized = normalizeEmail(email);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && /^[a-z0-9_-]{2,48}$/.test(String(roleId || ''))) safeAssignments[normalized] = String(roleId);
  });
  await setDoc(doc(db, 'config', 'userRoles'), { assignments:safeAssignments, updatedAt:serverTimestamp(), updatedBy:normalizeEmail(actorEmail) });
  return safeAssignments;
}
