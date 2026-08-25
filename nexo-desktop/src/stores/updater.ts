import { defineStore } from 'pinia';
import { ref } from 'vue';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// Estado global del auto-updater: se chequea una vez al arrancar la app
// (ver App.vue) y este store guarda el resultado para que el banner lo muestre.
export const useUpdaterStore = defineStore('updater', () => {
    const updateAvailable = ref(false);
    const version = ref<string | null>(null);
    const notes = ref<string | null>(null);
    const isDownloading = ref(false);
    const downloadProgress = ref(0);
    const error = ref<string | null>(null);

    // No reactivo a propósito: guardamos la instancia de Update que devuelve
    // `check()` para poder llamar `.downloadAndInstall()` más tarde.
    let pendingUpdate: Update | null = null;

    const checkForUpdate = async () => {
        try {
            const update = await check();
            if (update) {
                pendingUpdate = update;
                updateAvailable.value = true;
                version.value = update.version;
                notes.value = update.body ?? null;
            }
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
        }
    };

    const installUpdate = async () => {
        if (!pendingUpdate) return;

        isDownloading.value = true;
        error.value = null;
        let contentLength = 0;
        let downloaded = 0;

        try {
            await pendingUpdate.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        contentLength = event.data.contentLength ?? 0;
                        downloaded = 0;
                        downloadProgress.value = 0;
                        break;
                    case 'Progress':
                        downloaded += event.data.chunkLength;
                        downloadProgress.value = contentLength > 0
                            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
                            : 0;
                        break;
                    case 'Finished':
                        downloadProgress.value = 100;
                        break;
                }
            });

            await relaunch();
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
        } finally {
            isDownloading.value = false;
        }
    };

    const dismiss = () => {
        updateAvailable.value = false;
    };

    return {
        updateAvailable,
        version,
        notes,
        isDownloading,
        downloadProgress,
        error,
        checkForUpdate,
        installUpdate,
        dismiss,
    };
});
