<template>
  <div v-if="show && community" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div class="bg-[#313338] rounded-xl shadow-2xl w-[860px] h-[600px] flex overflow-hidden animate-fade-in-up">

      <!-- Tab nav -->
      <nav class="w-[200px] bg-[#2B2D31] p-4 flex flex-col gap-1 flex-shrink-0">
        <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1 truncate">{{ community.name }}</p>
        <button
          v-for="tab in visibleTabs"
          :key="tab.key"
          @click="selectTab(tab.key)"
          class="text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="activeTab === tab.key ? 'bg-[#404249] text-white' : 'text-gray-400 hover:bg-[#35373C] hover:text-gray-200'"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Content -->
      <div class="flex-1 flex flex-col overflow-hidden relative">
        <button
          @click="$emit('close')"
          class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-gray-300 transition-colors z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- ==================== GENERAL ==================== -->
        <div v-if="activeTab === 'general'" class="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <h2 class="text-lg font-bold text-gray-100 mb-5">Información general</h2>

          <div class="mb-4 max-w-md">
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nombre del servidor</label>
            <input
              type="text"
              v-model="generalForm.name"
              maxlength="50"
              class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div class="mb-4 max-w-md">
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Descripción</label>
            <textarea
              v-model="generalForm.description"
              rows="3"
              maxlength="300"
              placeholder="¿De qué trata tu servidor?"
              class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            ></textarea>
          </div>

          <div class="mb-6 max-w-md">
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Icono (URL)</label>
            <input
              type="text"
              v-model="generalForm.iconUrl"
              placeholder="https://ejemplo.com/icono.png"
              class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            @click="saveGeneral"
            :disabled="!generalForm.name.trim() || isSavingGeneral"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded font-medium transition-colors disabled:opacity-50"
          >
            {{ isSavingGeneral ? 'Guardando...' : 'Guardar cambios' }}
          </button>

          <!-- Zona de peligro -->
          <div v-if="community.isOwner" class="mt-10 border border-red-500/30 rounded-lg p-4 max-w-md">
            <h3 class="text-sm font-bold text-red-400 mb-1">Zona de peligro</h3>
            <p class="text-xs text-gray-500 mb-3">Eliminar el servidor borra todos sus canales, mensajes y roles. Esta acción no se puede deshacer.</p>
            <button
              @click="handleDeleteCommunity"
              class="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded font-medium text-sm transition-colors"
            >
              Eliminar servidor
            </button>
          </div>
        </div>

        <!-- ==================== ROLES ==================== -->
        <div v-else-if="activeTab === 'roles'" class="flex-1 flex overflow-hidden">
          <!-- Role list -->
          <div class="w-[200px] border-r border-white/[0.06] p-4 overflow-y-auto custom-scrollbar flex-shrink-0">
            <div class="flex items-center justify-between mb-3">
              <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Roles</p>
              <button
                @click="startCreateRole"
                class="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                title="Crear rol"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <button
              v-for="role in community.roles"
              :key="role.id"
              @click="selectRole(role)"
              class="w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-medium mb-1 transition-colors flex items-center gap-2"
              :class="selectedRoleId === role.id ? 'bg-[#404249] text-white' : 'text-gray-400 hover:bg-[#35373C]'"
            >
              <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: role.color || '#99aab5' }"></span>
              <span class="truncate">{{ role.name }}</span>
            </button>
            <p v-if="community.roles.length === 0" class="text-xs text-gray-600">Aún no hay roles.</p>
          </div>

          <!-- Role editor -->
          <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <template v-if="roleForm">
              <h2 class="text-lg font-bold text-gray-100 mb-5">{{ isNewRole ? 'Nuevo rol' : `Editar rol — ${roleForm.name}` }}</h2>

              <div class="mb-4 max-w-md">
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nombre del rol</label>
                <input
                  type="text"
                  v-model="roleForm.name"
                  maxlength="50"
                  class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div class="mb-5 max-w-md">
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Color</label>
                <div class="flex items-center gap-3">
                  <input type="color" v-model="roleForm.color" class="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
                  <span class="text-gray-400 text-sm">{{ roleForm.color }}</span>
                  <button @click="roleForm.color = '#99aab5'" class="text-xs text-gray-500 hover:text-gray-300 underline">Restablecer</button>
                </div>
              </div>

              <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Permisos</label>
              <div class="flex flex-col gap-1.5 mb-6 max-w-md">
                <label
                  v-for="perm in permissionList"
                  :key="perm.flag"
                  class="flex items-start gap-3 p-2.5 rounded-lg bg-[#2B2D31] hover:bg-[#35373C] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    :checked="(roleForm.permissions & perm.flag) === perm.flag"
                    @change="togglePermission(perm.flag)"
                    class="mt-0.5 accent-indigo-500"
                  />
                  <div>
                    <p class="text-gray-200 text-sm font-medium">{{ perm.label }}</p>
                    <p class="text-gray-500 text-xs">{{ perm.description }}</p>
                  </div>
                </label>
              </div>

              <div class="flex items-center gap-3">
                <button
                  @click="saveRole"
                  :disabled="!roleForm.name.trim() || isSavingRole"
                  class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded font-medium transition-colors disabled:opacity-50"
                >
                  {{ isSavingRole ? 'Guardando...' : (isNewRole ? 'Crear rol' : 'Guardar rol') }}
                </button>
                <button
                  v-if="!isNewRole"
                  @click="handleDeleteRole"
                  class="text-red-400 hover:text-red-300 px-4 py-2 font-medium text-sm transition-colors"
                >
                  Eliminar rol
                </button>
              </div>
            </template>
            <div v-else class="h-full flex items-center justify-center">
              <p class="text-gray-600 text-sm">Selecciona un rol o crea uno nuevo</p>
            </div>
          </div>
        </div>

        <!-- ==================== MIEMBROS ==================== -->
        <div v-else-if="activeTab === 'members'" class="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <h2 class="text-lg font-bold text-gray-100 mb-1">Miembros — {{ members.length }}</h2>
          <p class="text-xs text-gray-500 mb-5">Gestiona los roles y la moderación de tu comunidad</p>

          <div v-if="isLoadingMembers" class="flex justify-center py-10">
            <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>

          <div v-else class="flex flex-col gap-1">
            <div
              v-for="member in members"
              :key="member.id"
              class="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#35373C] transition-colors group"
            >
              <UserAvatar
                :username="member.user.username"
                :avatarUrl="member.user.avatarUrl"
                :status="member.user.status"
                size="md"
                :showStatus="false"
              />
              <div class="min-w-0">
                <p class="text-sm font-semibold truncate" :style="{ color: highestRoleColor(member) }">
                  {{ member.user.username }}<span class="text-gray-600 font-normal">#{{ member.user.tag }}</span>
                  <span v-if="member.isOwner" class="ml-1.5 text-[10px] text-amber-400" title="Dueño">👑</span>
                </p>
                <div class="flex items-center gap-1 flex-wrap mt-0.5">
                  <span
                    v-for="role in member.roles"
                    :key="role.id"
                    class="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1"
                    :style="{ borderColor: role.color || '#99aab5', color: role.color || '#99aab5' }"
                  >
                    {{ role.name }}
                  </span>
                </div>
              </div>

              <!-- Acciones -->
              <div class="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div v-if="canManageRoles && community.roles.length > 0" class="relative">
                  <button
                    @click.stop="roleMenuMemberId = roleMenuMemberId === member.id ? null : member.id"
                    class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
                  >
                    Roles
                  </button>
                  <div
                    v-if="roleMenuMemberId === member.id"
                    class="absolute right-0 top-[110%] bg-[#1a1b1e] rounded-xl shadow-2xl z-30 p-2 w-52 border border-white/[0.06]"
                    @click.stop
                  >
                    <label
                      v-for="role in community.roles"
                      :key="role.id"
                      class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        :checked="member.roles.some(r => r.id === role.id)"
                        @change="toggleMemberRole(member, role.id)"
                        class="accent-indigo-500"
                      />
                      <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: role.color || '#99aab5' }"></span>
                      <span class="text-sm text-gray-300 truncate">{{ role.name }}</span>
                    </label>
                  </div>
                </div>

                <button
                  v-if="canKick && !member.isOwner && member.userId !== currentUserId"
                  @click="handleKick(member)"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 border border-amber-500/30 transition-colors"
                >
                  Expulsar
                </button>
                <button
                  v-if="canBan && !member.isOwner && member.userId !== currentUserId"
                  @click="handleBan(member)"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/30 transition-colors"
                >
                  Banear
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== BANEOS ==================== -->
        <div v-else-if="activeTab === 'bans'" class="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <h2 class="text-lg font-bold text-gray-100 mb-5">Baneos — {{ bans.length }}</h2>

          <div v-if="isLoadingBans" class="flex justify-center py-10">
            <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>

          <p v-else-if="bans.length === 0" class="text-gray-600 text-sm">No hay usuarios baneados.</p>

          <div v-else class="flex flex-col gap-1">
            <div
              v-for="ban in bans"
              :key="ban.id"
              class="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#35373C] transition-colors group"
            >
              <UserAvatar
                :username="ban.user.username"
                :avatarUrl="ban.user.avatarUrl"
                status="offline"
                size="md"
                :showStatus="false"
              />
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-200 truncate">
                  {{ ban.user.username }}<span class="text-gray-600 font-normal">#{{ ban.user.tag }}</span>
                </p>
                <p class="text-xs text-gray-500 truncate">{{ ban.reason || 'Sin motivo' }}</p>
              </div>
              <button
                @click="handleUnban(ban)"
                class="ml-auto px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:bg-white/[0.08] border border-white/[0.08] opacity-0 group-hover:opacity-100 transition-all"
              >
                Quitar baneo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useCommunityStore, Permissions } from '../stores/community';
import type { Community, Role, CommunityMember, CommunityBan } from '../stores/community';
import UserAvatar from './UserAvatar.vue';

const props = defineProps<{
  show: boolean;
  community: Community | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const authStore = useAuthStore();
const communityStore = useCommunityStore();

const currentUserId = computed(() => authStore.user?.id);

const permissionList = [
  { flag: Permissions.ADMINISTRATOR, label: 'Administrador', description: 'Todos los permisos. Úsalo con cuidado.' },
  { flag: Permissions.MANAGE_COMMUNITY, label: 'Gestionar servidor', description: 'Editar nombre, icono y descripción' },
  { flag: Permissions.MANAGE_CHANNELS, label: 'Gestionar canales', description: 'Crear, renombrar y eliminar canales y categorías' },
  { flag: Permissions.MANAGE_ROLES, label: 'Gestionar roles', description: 'Crear roles y asignarlos a miembros' },
  { flag: Permissions.KICK_MEMBERS, label: 'Expulsar miembros', description: 'Sacar miembros del servidor' },
  { flag: Permissions.BAN_MEMBERS, label: 'Banear miembros', description: 'Banear y desbanear usuarios' },
  { flag: Permissions.MANAGE_MESSAGES, label: 'Gestionar mensajes', description: 'Eliminar mensajes de otros miembros' },
  { flag: Permissions.CREATE_INVITES, label: 'Crear invitaciones', description: 'Generar enlaces de invitación' },
];

const canManageCommunity = computed(() => props.community ? communityStore.can(Permissions.MANAGE_COMMUNITY, props.community.id) : false);
const canManageRoles = computed(() => props.community ? communityStore.can(Permissions.MANAGE_ROLES, props.community.id) : false);
const canKick = computed(() => props.community ? communityStore.can(Permissions.KICK_MEMBERS, props.community.id) : false);
const canBan = computed(() => props.community ? communityStore.can(Permissions.BAN_MEMBERS, props.community.id) : false);

const visibleTabs = computed(() => {
  const tabs: Array<{ key: string; label: string }> = [];
  if (canManageCommunity.value) tabs.push({ key: 'general', label: 'General' });
  if (canManageRoles.value) tabs.push({ key: 'roles', label: 'Roles' });
  tabs.push({ key: 'members', label: 'Miembros' });
  if (canBan.value) tabs.push({ key: 'bans', label: 'Baneos' });
  return tabs;
});

const activeTab = ref('members');

// ===================== General =====================
const generalForm = ref({ name: '', description: '', iconUrl: '' });
const isSavingGeneral = ref(false);

// ===================== Roles =====================
const selectedRoleId = ref<string | null>(null);
const isNewRole = ref(false);
const roleForm = ref<{ name: string; color: string; permissions: number } | null>(null);
const isSavingRole = ref(false);

// ===================== Miembros =====================
const members = ref<CommunityMember[]>([]);
const isLoadingMembers = ref(false);
const roleMenuMemberId = ref<string | null>(null);

// ===================== Baneos =====================
const bans = ref<CommunityBan[]>([]);
const isLoadingBans = ref(false);

watch(() => props.show, (newVal) => {
  if (newVal && props.community) {
    activeTab.value = visibleTabs.value[0]?.key ?? 'members';
    generalForm.value = {
      name: props.community.name,
      description: props.community.description ?? '',
      iconUrl: props.community.iconUrl ?? ''
    };
    selectedRoleId.value = null;
    roleForm.value = null;
    isNewRole.value = false;
    roleMenuMemberId.value = null;
    if (activeTab.value === 'members') loadMembers();
  }
});

const selectTab = (key: string) => {
  activeTab.value = key;
  roleMenuMemberId.value = null;
  if (key === 'members') loadMembers();
  if (key === 'bans') loadBans();
};

const saveGeneral = async () => {
  if (!props.community) return;
  isSavingGeneral.value = true;
  const success = await communityStore.updateCommunity(props.community.id, {
    name: generalForm.value.name,
    description: generalForm.value.description,
    iconUrl: generalForm.value.iconUrl
  });
  isSavingGeneral.value = false;
  if (!success) alert('Hubo un error al guardar los cambios.');
};

const handleDeleteCommunity = async () => {
  if (!props.community) return;
  if (!confirm(`¿Eliminar "${props.community.name}" definitivamente? Esta acción no se puede deshacer.`)) return;
  const success = await communityStore.deleteCommunity(props.community.id);
  if (success) {
    emit('close');
  } else {
    alert('Hubo un error al eliminar el servidor.');
  }
};

const selectRole = (role: Role) => {
  selectedRoleId.value = role.id;
  isNewRole.value = false;
  roleForm.value = {
    name: role.name,
    color: role.color || '#99aab5',
    permissions: role.permissions
  };
};

const startCreateRole = () => {
  selectedRoleId.value = null;
  isNewRole.value = true;
  roleForm.value = { name: '', color: '#99aab5', permissions: 0 };
};

const togglePermission = (flag: number) => {
  if (!roleForm.value) return;
  roleForm.value.permissions ^= flag;
};

const saveRole = async () => {
  if (!props.community || !roleForm.value) return;
  isSavingRole.value = true;

  let success: boolean;
  if (isNewRole.value) {
    const role = await communityStore.createRole(props.community.id, {
      name: roleForm.value.name,
      color: roleForm.value.color,
      permissions: roleForm.value.permissions
    });
    success = !!role;
    if (role) selectRole(role);
  } else {
    success = await communityStore.updateRole(props.community.id, selectedRoleId.value!, {
      name: roleForm.value.name,
      color: roleForm.value.color,
      permissions: roleForm.value.permissions
    });
  }

  isSavingRole.value = false;
  if (!success) alert('Hubo un error al guardar el rol.');
};

const handleDeleteRole = async () => {
  if (!props.community || !selectedRoleId.value) return;
  if (!confirm('¿Eliminar este rol? Se quitará de todos los miembros que lo tengan.')) return;
  const success = await communityStore.deleteRole(props.community.id, selectedRoleId.value);
  if (success) {
    selectedRoleId.value = null;
    roleForm.value = null;
  } else {
    alert('Hubo un error al eliminar el rol.');
  }
};

const loadMembers = async () => {
  if (!props.community) return;
  isLoadingMembers.value = true;
  members.value = await communityStore.fetchMembers(props.community.id);
  isLoadingMembers.value = false;
};

const loadBans = async () => {
  if (!props.community) return;
  isLoadingBans.value = true;
  bans.value = await communityStore.fetchBans(props.community.id);
  isLoadingBans.value = false;
};

const highestRoleColor = (member: CommunityMember): string => {
  const colored = member.roles.find(r => r.color);
  return colored?.color || '#dbdee1';
};

const toggleMemberRole = async (member: CommunityMember, roleId: string) => {
  if (!props.community) return;
  const has = member.roles.some(r => r.id === roleId);
  const newRoleIds = has
    ? member.roles.filter(r => r.id !== roleId).map(r => r.id)
    : [...member.roles.map(r => r.id), roleId];

  const success = await communityStore.setMemberRoles(props.community.id, member.userId, newRoleIds);
  if (success) {
    await loadMembers();
  } else {
    alert('Hubo un error al actualizar los roles del miembro.');
  }
};

const handleKick = async (member: CommunityMember) => {
  if (!props.community) return;
  if (!confirm(`¿Expulsar a ${member.user.username} del servidor?`)) return;
  const success = await communityStore.kickMember(props.community.id, member.userId);
  if (success) {
    await loadMembers();
  } else {
    alert('Hubo un error al expulsar al miembro.');
  }
};

const handleBan = async (member: CommunityMember) => {
  if (!props.community) return;
  const reason = prompt(`¿Banear a ${member.user.username}? Escribe un motivo (opcional):`);
  if (reason === null) return;
  const success = await communityStore.banMember(props.community.id, member.userId, reason);
  if (success) {
    await loadMembers();
  } else {
    alert('Hubo un error al banear al miembro.');
  }
};

const handleUnban = async (ban: CommunityBan) => {
  if (!props.community) return;
  if (!confirm(`¿Quitar el baneo a ${ban.user.username}?`)) return;
  const success = await communityStore.unbanMember(props.community.id, ban.userId);
  if (success) {
    await loadBans();
  } else {
    alert('Hubo un error al quitar el baneo.');
  }
};
</script>
