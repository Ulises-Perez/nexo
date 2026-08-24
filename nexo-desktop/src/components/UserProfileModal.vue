<template>
  <div
    v-if="profileStore.isOpen"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
    @click="profileStore.close()"
  >
    <div
      class="relative w-[780px] max-w-[94vw] min-h-[520px] max-h-[88vh] bg-[#1e1f23] rounded-[20px] border border-white/[0.06] shadow-2xl shadow-black/80 overflow-hidden flex"
      @click.stop
    >
      <!-- Cerrar -->
      <button
        @click="profileStore.close()"
        class="absolute top-3.5 right-3.5 z-30 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors shadow-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>

      <!-- Loading: skeleton shaped like the real two-column layout, so the modal
           doesn't jump in size once data arrives. -->
      <div v-if="isLoading" class="flex w-full animate-pulse">
        <div class="w-[340px] flex-shrink-0 flex flex-col border-r border-white/[0.06]">
          <div class="h-28 bg-white/[0.04]"></div>
          <div class="px-5 -mt-11 relative z-10">
            <div class="rounded-full p-[5px] bg-[#1e1f23] w-fit">
              <div class="w-16 h-16 rounded-full bg-white/[0.08]"></div>
            </div>
          </div>
          <div class="px-5 mt-3 flex flex-col gap-2">
            <div class="h-5 w-32 rounded bg-white/[0.06]"></div>
            <div class="h-3 w-24 rounded bg-white/[0.04]"></div>
            <div class="flex items-center gap-2 mt-3.5">
              <div class="flex-1 h-9 rounded-lg bg-white/[0.05]"></div>
              <div class="w-9 h-9 rounded-lg bg-white/[0.05]"></div>
              <div class="w-9 h-9 rounded-lg bg-white/[0.05]"></div>
            </div>
          </div>
          <div class="mx-4 mt-4 h-32 rounded-2xl bg-white/[0.03]"></div>
        </div>
        <div class="flex-1 flex flex-col min-w-0">
          <div class="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-white/[0.06]">
            <div class="h-7 w-20 rounded-lg bg-white/[0.05]"></div>
            <div class="h-7 w-28 rounded-lg bg-white/[0.03]"></div>
            <div class="h-7 w-32 rounded-lg bg-white/[0.03]"></div>
          </div>
          <div class="flex-1 p-4 flex flex-col gap-3">
            <div class="h-20 rounded-2xl bg-white/[0.03]"></div>
            <div class="h-4 w-2/3 rounded bg-white/[0.04]"></div>
            <div class="h-4 w-1/2 rounded bg-white/[0.04]"></div>
          </div>
        </div>
      </div>

      <template v-else-if="user">
        <!-- ============ LEFT COLUMN (profile card) ============ -->
        <div class="w-[340px] flex-shrink-0 flex flex-col overflow-y-auto custom-scrollbar border-r border-white/[0.06]">
          <!-- Banner -->
          <div class="h-28 relative" :style="{ background: bannerStyle }">
            <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
          </div>

          <!-- Avatar con anillo, sobre el banner -->
          <div class="px-5 -mt-11 relative z-10 flex items-end justify-between">
            <div class="rounded-full p-[5px] bg-[#1e1f23]">
              <UserAvatar
                :username="user.username"
                :avatarUrl="user.avatarUrl"
                :status="user.status"
                size="xl"
                :showStatus="true"
                statusBorderColor="#1e1f23"
              />
            </div>

            <!-- Insignias -->
            <div class="flex items-center gap-1 bg-[#141518] border border-white/[0.06] rounded-xl px-2 py-1.5 mb-1">
              <div v-if="member?.isOwner" class="relative group/badge">
                <span class="w-6 h-6 flex items-center justify-center text-[14px] cursor-default">👑</span>
                <span class="profile-tooltip">Dueño de la comunidad</span>
              </div>
              <div class="relative group/badge">
                <span class="w-6 h-6 flex items-center justify-center cursor-default text-amber-400">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </span>
                <span class="profile-tooltip">En Nexo desde el {{ formatDate(user.createdAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Identidad + acciones -->
          <div class="px-5 mt-3">
            <h3 class="text-[20px] font-bold truncate leading-tight" :style="nameStyle">{{ user.username }}</h3>
            <p class="text-[13px] text-gray-500 flex items-center">
              <span class="min-w-0 truncate">{{ user.username }}<span class="text-gray-600">#{{ user.tag }}</span></span>
            </p>
            <p v-if="user.customStatus" class="text-[13px] text-gray-300 truncate mt-0.5">{{ user.customStatus }}</p>
            <p v-if="user.pronouns" class="text-[12px] text-gray-500 truncate mt-0.5">{{ user.pronouns }}</p>

            <!-- Acciones -->
            <div class="flex items-center gap-2 mt-3.5">
              <template v-if="isSelf">
                <button
                  @click="editProfile"
                  class="flex-1 flex items-center justify-center gap-2 text-[13px] font-semibold py-2 rounded-lg transition-colors"
                  :style="accentButtonStyle"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Editar perfil
                </button>
              </template>

              <template v-else>
                <!-- Mensaje -->
                <button
                  @click="sendMessage"
                  class="flex-1 flex items-center justify-center gap-2 text-[13px] font-semibold py-2 rounded-lg transition-colors"
                  :style="accentButtonStyle"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Mensaje
                </button>

                <!-- Botón de amistad -->
                <div v-if="friendStatus !== 'loading'" class="relative group/badge">
                  <button
                    @click="handleFriendAction"
                    class="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200"
                    :class="friendButtonClass"
                  >
                    <svg v-if="friendStatus === 'none'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <svg v-else-if="friendStatus === 'pending_sent'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <svg v-else-if="friendStatus === 'pending_received'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <template v-else-if="friendStatus === 'friends'">
                      <svg class="h-4 w-4 group-hover/badge:hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <svg class="h-4 w-4 hidden group-hover/badge:block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                      </svg>
                    </template>
                  </button>
                  <span class="profile-tooltip profile-tooltip-below">{{ friendButtonTooltip }}</span>
                </div>

                <!-- Más (menú no-op) -->
                <button
                  class="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.05] text-gray-400 hover:bg-white/[0.1] hover:text-white transition-colors"
                  title="Más"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                </button>
              </template>
            </div>
          </div>

          <!-- Tarjeta interior -->
          <div class="mx-4 mt-4 mb-4 bg-[#141518] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
            <!-- Bio -->
            <div v-if="user.bio">
              <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Bio</p>
              <p class="text-[13px] text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{{ user.bio }}</p>
              <div class="h-px bg-white/[0.06] mt-3"></div>
            </div>

            <!-- Miembro desde -->
            <div>
              <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Miembro desde</p>
              <p class="text-[13px] text-gray-200">{{ formatDate(user.createdAt) }}</p>
            </div>

            <!-- Conexiones -->
            <template v-if="user.connections && user.connections.length > 0">
              <div class="h-px bg-white/[0.06]"></div>
              <div>
                <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Conexiones</p>
                <div class="flex flex-col gap-1.5">
                  <component
                    v-for="conn in user.connections"
                    :key="conn.id"
                    :is="conn.url ? 'a' : 'div'"
                    :href="conn.url || undefined"
                    :target="conn.url ? '_blank' : undefined"
                    :rel="conn.url ? 'noopener noreferrer' : undefined"
                    class="flex items-center gap-2.5 bg-[#1a1b1e] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors"
                    :class="conn.url ? 'hover:bg-white/[0.04] cursor-pointer' : ''"
                  >
                    <span class="flex-shrink-0 text-gray-200" v-html="platformIcon(conn.platform, 'h-4 w-4')"></span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] text-gray-200 truncate">{{ conn.name }}</p>
                      <p class="text-[11px] text-gray-500 truncate">{{ platformLabel(conn.platform) }}</p>
                    </div>
                    <svg v-if="conn.url" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </component>
                </div>
              </div>
            </template>

            <!-- Roles (contexto de comunidad) -->
            <template v-if="member">
              <div class="h-px bg-white/[0.06]"></div>
              <div>
                <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Roles</p>
                <div class="relative flex items-center gap-1.5 flex-wrap">
                  <span
                    v-for="role in member.roles"
                    :key="role.id"
                    class="text-[12px] pl-2 pr-1.5 py-1 rounded-md flex items-center gap-1.5 group/role bg-white/[0.05]"
                  >
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: role.color || '#99aab5' }"></span>
                    <span class="text-gray-200">{{ role.name }}</span>
                    <button
                      v-if="canManageRoles"
                      @click="removeRole(role.id)"
                      class="w-4 h-4 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/[0.1] transition-colors leading-none"
                      title="Quitar rol"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                      </svg>
                    </button>
                  </span>

                  <span v-if="member.roles.length === 0 && !canManageRoles" class="text-[12px] text-gray-600">Sin roles</span>

                  <button
                    v-if="canManageRoles"
                    ref="addBtnRef"
                    @click="toggleRolePicker"
                    class="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
                    :class="showRolePicker ? 'bg-white/[0.12] text-white' : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.12] hover:text-white'"
                    title="Agregar rol"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>

                  <!-- Selector de roles (popover con buscador) -->
                  <div
                    v-if="showRolePicker && canManageRoles"
                    ref="pickerRef"
                    class="role-picker absolute left-0 top-[calc(100%+8px)] w-full bg-[#111214] border border-black/40 rounded-lg shadow-2xl shadow-black/60 z-30 overflow-hidden"
                    @click.stop
                  >
                    <div class="p-2 border-b border-white/[0.06]">
                      <input
                        ref="roleSearchRef"
                        v-model="roleSearch"
                        type="text"
                        placeholder="Rol"
                        class="w-full bg-[#1e1f23] text-gray-200 text-[14px] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 placeholder-gray-500 border border-white/[0.06]"
                      />
                    </div>
                    <div class="max-h-52 overflow-y-auto custom-scrollbar py-1">
                      <button
                        v-for="role in filteredAvailableRoles"
                        :key="role.id"
                        @click="addRole(role.id)"
                        class="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/[0.06] transition-colors text-left"
                      >
                        <span class="w-3.5 h-3.5 rounded-full flex-shrink-0" :style="{ backgroundColor: role.color || '#99aab5' }"></span>
                        <span class="text-[14px] text-gray-300 truncate flex-1">{{ role.name }}</span>
                      </button>
                      <p v-if="filteredAvailableRoles.length === 0" class="text-[13px] text-gray-600 px-3 py-3 text-center">
                        {{ availableRoles.length === 0 ? 'No hay más roles disponibles' : 'Sin coincidencias' }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Roles: aún cargando en segundo plano (solo aplica con contexto de comunidad) -->
            <template v-else-if="isMemberLoading">
              <div class="h-px bg-white/[0.06]"></div>
              <div>
                <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Roles</p>
                <div class="flex items-center gap-1.5 animate-pulse">
                  <div class="h-6 w-16 rounded-md bg-white/[0.05]"></div>
                  <div class="h-6 w-20 rounded-md bg-white/[0.05]"></div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- ============ RIGHT COLUMN (tabs) ============ -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- Tabs -->
          <div class="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-white/[0.06]">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              @click="activeTab = tab.key"
              class="text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              :class="activeTab === tab.key ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Tab content -->
          <div class="flex-1 overflow-y-auto custom-scrollbar p-4">
            <!-- Actividad -->
            <template v-if="activeTab === 'activity'">
              <div v-if="user.customStatus" class="bg-[#141518] border border-white/[0.06] rounded-2xl p-4">
                <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Estado personalizado</p>
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p class="text-[14px] text-gray-200 break-words">{{ user.customStatus }}</p>
                </div>
              </div>
              <div v-else class="flex flex-col items-center justify-center py-16 text-center">
                <div class="w-14 h-14 mb-4 rounded-2xl bg-white/[0.03] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p class="text-[14px] text-gray-500 font-medium">Sin actividad reciente</p>
              </div>
            </template>

            <!-- Amigos en común -->
            <template v-else-if="activeTab === 'friends'">
              <div v-if="isMutualsLoading && mutualFriends.length === 0" class="flex flex-col gap-1 animate-pulse">
                <div class="h-10 rounded-xl bg-white/[0.03]"></div>
                <div class="h-10 rounded-xl bg-white/[0.03]"></div>
                <div class="h-10 rounded-xl bg-white/[0.03]"></div>
              </div>
              <div v-else-if="mutualFriends.length > 0" class="flex flex-col gap-1">
                <button
                  v-for="f in mutualFriends"
                  :key="f.id"
                  @click="profileStore.open(f.id, profileStore.communityId)"
                  class="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
                >
                  <UserAvatar :username="f.username" :avatarUrl="f.avatarUrl" :status="f.status" size="sm" :showStatus="true" />
                  <span class="text-[14px] text-gray-200 truncate">{{ f.username }}</span>
                </button>
              </div>
              <div v-else class="flex flex-col items-center justify-center py-16 text-center">
                <p class="text-[14px] text-gray-500 font-medium">No tienen amigos en común</p>
              </div>
            </template>

            <!-- Servidores en común -->
            <template v-else-if="activeTab === 'communities'">
              <div v-if="isMutualsLoading && mutualCommunities.length === 0" class="flex flex-col gap-1 animate-pulse">
                <div class="h-11 rounded-xl bg-white/[0.03]"></div>
                <div class="h-11 rounded-xl bg-white/[0.03]"></div>
                <div class="h-11 rounded-xl bg-white/[0.03]"></div>
              </div>
              <div v-else-if="mutualCommunities.length > 0" class="flex flex-col gap-1">
                <div
                  v-for="c in mutualCommunities"
                  :key="c.id"
                  class="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <div class="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 bg-[#1a1b1e] flex items-center justify-center">
                    <img v-if="c.iconUrl" :src="c.iconUrl" :alt="c.name" class="w-full h-full object-cover" />
                    <span v-else class="text-[14px] font-bold text-gray-400">{{ c.name.charAt(0).toUpperCase() }}</span>
                  </div>
                  <span class="text-[14px] text-gray-200 truncate">{{ c.name }}</span>
                </div>
              </div>
              <div v-else class="flex flex-col items-center justify-center py-16 text-center">
                <p class="text-[14px] text-gray-500 font-medium">No tienen servidores en común</p>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useUserProfileStore } from '../stores/userProfile';
import { useCommunityStore, Permissions } from '../stores/community';
import { useFriendsStore } from '../stores/friends';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useUserSettingsStore } from '../stores/userSettings';
import { useUserBanner } from '../composables/useUserBanner';
import { useReadableAccent } from '../composables/useReadableAccent';
import { platformLabel, platformIcon } from '../composables/usePlatformIcon';
import type { CommunityMember, Role } from '../stores/community';
import type { UserConnection } from '../stores/auth';
import UserAvatar from './UserAvatar.vue';
import api from '../api/axios';

interface ProfileUser {
  id: string;
  username: string;
  tag: string;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  bio?: string | null;
  bannerUrl?: string | null;
  bannerColor?: string | null;
  accentColor?: string | null;
  pronouns?: string | null;
  customStatus?: string | null;
  connections?: UserConnection[];
}

interface MutualFriend {
  id: string;
  username: string;
  tag: string;
  avatarUrl: string | null;
  status: string;
}
interface MutualCommunity {
  id: string;
  name: string;
  iconUrl: string | null;
}

type FriendStatus = 'loading' | 'self' | 'friends' | 'pending_sent' | 'pending_received' | 'none';
type TabKey = 'activity' | 'friends' | 'communities';

const profileStore = useUserProfileStore();
const communityStore = useCommunityStore();
const friendsStore = useFriendsStore();
const authStore = useAuthStore();
const chatStore = useChatStore();
const userSettingsStore = useUserSettingsStore();

const user = ref<ProfileUser | null>(null);
const member = ref<CommunityMember | null>(null);
const isLoading = ref(false);
const isMemberLoading = ref(false);
const isMutualsLoading = ref(false);
const showRolePicker = ref(false);
const roleSearch = ref('');
const friendStatus = ref<FriendStatus>('loading');
const friendRequestId = ref('');

const mutualFriends = ref<MutualFriend[]>([]);
const mutualCommunities = ref<MutualCommunity[]>([]);
const activeTab = ref<TabKey>('activity');

const addBtnRef = ref<HTMLElement | null>(null);
const pickerRef = ref<HTMLElement | null>(null);
const roleSearchRef = ref<HTMLInputElement | null>(null);

const isSelf = computed(() => !!user.value && user.value.id === authStore.user?.id);

const tabs = computed(() => {
  const list = [{ key: 'activity' as TabKey, label: 'Actividad' }];
  // Mutuals are structurally empty on your own profile — hide those tabs.
  if (!isSelf.value) {
    const friendCount = mutualFriends.value.length;
    const communityCount = mutualCommunities.value.length;
    list.push({
      key: 'friends' as TabKey,
      label: friendCount > 0 ? `${friendCount} amigos en común` : 'Amigos en común',
    });
    list.push({
      key: 'communities' as TabKey,
      label: communityCount > 0 ? `${communityCount} servidores en común` : 'Servidores en común',
    });
  }
  return list;
});

const community = computed(() =>
  communityStore.communities.find(c => c.id === profileStore.communityId) ?? null
);

const canManageRoles = computed(() =>
  !!member.value && !!profileStore.communityId && communityStore.can(Permissions.MANAGE_ROLES, profileStore.communityId)
);

const availableRoles = computed<Role[]>(() => {
  if (!community.value || !member.value) return [];
  const assigned = new Set(member.value.roles.map(r => r.id));
  return community.value.roles.filter(r => !assigned.has(r.id));
});

const filteredAvailableRoles = computed<Role[]>(() => {
  const q = roleSearch.value.trim().toLowerCase();
  if (!q) return availableRoles.value;
  return availableRoles.value.filter(r => r.name.toLowerCase().includes(q));
});

const toggleRolePicker = () => {
  showRolePicker.value = !showRolePicker.value;
  if (showRolePicker.value) {
    roleSearch.value = '';
    nextTick(() => roleSearchRef.value?.focus());
  }
};

const handleClickOutside = (e: MouseEvent) => {
  if (!showRolePicker.value) return;
  const target = e.target as Node;
  if (pickerRef.value?.contains(target) || addBtnRef.value?.contains(target)) return;
  showRolePicker.value = false;
};
document.addEventListener('mousedown', handleClickOutside);
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside));

// Banner resuelto vía composable compartido (imagen > color > degradado).
const { bannerStyle } = useUserBanner(() => ({
  bannerUrl: user.value?.bannerUrl,
  bannerColor: user.value?.bannerColor,
  username: user.value?.username,
}));

// Acento sutil con guarda de contraste: el nombre cae a blanco si el acento es
// ilegible sobre la tarjeta, y los botones primarios eligen una etiqueta legible.
const { nameStyle, accentButtonStyle } = useReadableAccent(() => user.value?.accentColor);

const friendButtonClass = computed(() => {
  switch (friendStatus.value) {
    case 'none': return 'bg-emerald-600/90 hover:bg-emerald-500 text-white';
    case 'pending_sent': return 'bg-white/[0.05] text-gray-300 cursor-default';
    case 'pending_received': return 'bg-indigo-500/90 hover:bg-indigo-400 text-white';
    case 'friends': return 'bg-white/[0.05] text-emerald-400 hover:bg-red-500/90 hover:text-white';
    default: return 'bg-white/[0.05] text-gray-300';
  }
});

const friendButtonTooltip = computed(() => {
  switch (friendStatus.value) {
    case 'none': return 'Agregar amigo';
    case 'pending_sent': return 'Solicitud enviada';
    case 'pending_received': return 'Aceptar solicitud';
    case 'friends': return 'Eliminar amigo';
    default: return '';
  }
});

// Re-run load() both when the modal opens AND when the target user changes while
// it's already open (e.g. clicking a mutual friend calls profileStore.open(),
// which swaps userId without toggling isOpen). loadedUserId dedupes the open
// transition: profileStore.open() sets userId and isOpen in the same tick, so
// both watchers fire — we load once and skip the redundant second call.
const loadedUserId = ref('');

const reload = () => {
  loadedUserId.value = profileStore.userId;
  showRolePicker.value = false;
  roleSearch.value = '';
  activeTab.value = 'activity';
  load();
};

watch(() => [profileStore.isOpen, profileStore.userId] as const, ([open, id]) => {
  if (!open || !id || id === loadedUserId.value) return;
  reload();
});

watch(() => profileStore.isOpen, (open) => {
  if (!open) loadedUserId.value = '';
});

// Las tres llamadas (perfil+amistad, roles de comunidad, amigos/comunidades en
// común) no dependen entre sí — solo necesitan el userId/communityId ya
// conocidos de forma síncrona — así que se disparan todas en paralelo en vez
// de esperarse en cadena. Solo la primera bloquea isLoading: roles y mutuals
// se muestran cuando llegan, sin retrasar el resto del modal.
const load = async () => {
  const requestedId = profileStore.userId;
  const requestedCommunityId = profileStore.communityId;
  const self = requestedId === authStore.user?.id;

  isLoading.value = true;
  isMemberLoading.value = false;
  isMutualsLoading.value = false;
  user.value = null;
  member.value = null;
  friendStatus.value = 'loading';
  friendRequestId.value = '';
  mutualFriends.value = [];
  mutualCommunities.value = [];

  if (requestedCommunityId) {
    loadMember(requestedId, requestedCommunityId);
  }
  // Self-profile: skip mutuals (always empty with yourself).
  if (!self) {
    loadMutuals(requestedId);
  }

  try {
    const [userResponse, status] = await Promise.all([
      api.get(`/users/${requestedId}`),
      friendsStore.getFriendStatus(requestedId),
    ]);
    if (loadedUserId.value !== requestedId) return; // se reabrió para otro usuario mientras tanto
    user.value = userResponse.data;
    friendStatus.value = status.status as FriendStatus;
    friendRequestId.value = status.requestId ?? '';
  } catch (error) {
    console.error('Error cargando perfil:', error);
  } finally {
    if (loadedUserId.value === requestedId) isLoading.value = false;
  }
};

const loadMutuals = async (requestedId: string) => {
  isMutualsLoading.value = true;
  try {
    const [friendsRes, communitiesRes] = await Promise.all([
      api.get(`/users/${requestedId}/mutual-friends`),
      api.get(`/users/${requestedId}/mutual-communities`),
    ]);
    if (loadedUserId.value !== requestedId) return;
    mutualFriends.value = friendsRes.data ?? [];
    mutualCommunities.value = communitiesRes.data ?? [];
  } catch (error) {
    console.error('Error cargando datos en común:', error);
  } finally {
    if (loadedUserId.value === requestedId) isMutualsLoading.value = false;
  }
};

const loadMember = async (
  requestedId: string = profileStore.userId,
  communityId: string = profileStore.communityId,
) => {
  isMemberLoading.value = true;
  try {
    const members = await communityStore.getMembersCached(communityId);
    if (loadedUserId.value !== requestedId) return;
    member.value = members.find(m => m.userId === requestedId) ?? null;
  } finally {
    if (loadedUserId.value === requestedId) isMemberLoading.value = false;
  }
};

const editProfile = () => {
  profileStore.close();
  userSettingsStore.open();
};

const sendMessage = async () => {
  if (!user.value) return;
  await chatStore.openDM({
    id: user.value.id,
    username: user.value.username,
    tag: user.value.tag,
    avatarUrl: user.value.avatarUrl,
    status: user.value.status,
  });
  profileStore.close();
};

const handleFriendAction = async () => {
  if (!user.value) return;

  if (friendStatus.value === 'none') {
    const result = await friendsStore.sendFriendRequest(user.value.id);
    if (result.success) {
      friendStatus.value = 'pending_sent';
    } else {
      alert(result.error);
    }
  } else if (friendStatus.value === 'pending_received' && friendRequestId.value) {
    const result = await friendsStore.acceptRequest(friendRequestId.value);
    if (result.success) {
      friendStatus.value = 'friends';
    } else {
      alert(result.error);
    }
  } else if (friendStatus.value === 'friends') {
    if (!confirm(`¿Eliminar a ${user.value.username} de tus amigos?`)) return;
    const result = await friendsStore.removeFriend(user.value.id);
    if (result.success) {
      friendStatus.value = 'none';
    } else {
      alert(result.error);
    }
  }
};

const setRoles = async (roleIds: string[]) => {
  const success = await communityStore.setMemberRoles(profileStore.communityId, profileStore.userId, roleIds);
  if (success) {
    await loadMember();
  } else {
    alert('Hubo un error al actualizar los roles.');
  }
};

const addRole = async (roleId: string) => {
  if (!member.value) return;
  await setRoles([...member.value.roles.map(r => r.id), roleId]);
};

const removeRole = async (roleId: string) => {
  if (!member.value) return;
  await setRoles(member.value.roles.filter(r => r.id !== roleId).map(r => r.id));
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};
</script>

<style scoped>
.profile-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.92);
  color: #e5e7eb;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
  display: none;
  z-index: 30;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.profile-tooltip-below {
  bottom: auto;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
}

.group\/badge:hover .profile-tooltip {
  display: block;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
