import { defineStore } from 'pinia';
import { ref } from 'vue';

// Estado global del modal de perfil de usuario (se abre desde chat, lista de miembros o canales de voz)
export const useUserProfileStore = defineStore('userProfile', () => {
    const isOpen = ref(false);
    const userId = ref('');
    // Comunidad en cuyo contexto se abre el perfil ('' = sin contexto, ej. DMs)
    const communityId = ref('');

    const open = (targetUserId: string, targetCommunityId?: string) => {
        userId.value = targetUserId;
        communityId.value = targetCommunityId ?? '';
        isOpen.value = true;
    };

    const close = () => {
        isOpen.value = false;
        userId.value = '';
        communityId.value = '';
    };

    return { isOpen, userId, communityId, open, close };
});
