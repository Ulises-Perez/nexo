import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useUserProfileStore } from './userProfile';

// Global open/close state for the user settings (edit profile) modal, so it can
// be launched both from the user panel and from the self-profile modal.
export const useUserSettingsStore = defineStore('userSettings', () => {
    const isOpen = ref(false);

    const open = () => {
        // Los modales de perfil y de ajustes están siempre montados; abrir uno
        // cierra el otro para que nunca queden superpuestos.
        useUserProfileStore().close();
        isOpen.value = true;
    };
    const close = () => { isOpen.value = false; };

    return { isOpen, open, close };
});
