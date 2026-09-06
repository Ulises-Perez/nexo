import { ref } from 'vue';
import api from '../../api/axios';
import type { PendingAttachment } from './types';

// Pending attachment upload flow (presign via backend, direct PUT to the
// presigned URL). Extracted verbatim from stores/chat.ts.
export function useAttachments() {
    const pendingAttachments = ref<PendingAttachment[]>([]);

    // Mutates an attachment through the reactive array (by id) instead of a
    // detached object reference, so Vue's Proxy set trap actually fires and
    // the UI (MessageInput's v-for, canSend) picks up the change. Mutating a
    // raw closure variable after push() is invisible to Vue's reactivity.
    function updateAttachment(id: string, patch: Partial<PendingAttachment>) {
        const target = pendingAttachments.value.find(a => a.id === id);
        if (target) Object.assign(target, patch);
    }

    function getFileType(file: File): 'image' | 'video' | 'audio' | 'file' {
        if (file.type.startsWith('image/')) return 'image';
        if (file.type.startsWith('video/')) return 'video';
        if (file.type.startsWith('audio/')) return 'audio';
        return 'file';
    }

    async function uploadFile(file: File): Promise<PendingAttachment> {
        const id = crypto.randomUUID();
        const type = getFileType(file);

        const attachment: PendingAttachment = {
            id,
            file,
            type,
            status: 'pending',
            // Solo image/video muestran <img>/<video src>; audio y file
            // genéricos no usan previewUrl, así que no vale la pena crear
            // (y tener que revocar) un object URL para ellos.
            previewUrl: (type === 'image' || type === 'video') ? URL.createObjectURL(file) : undefined
        };

        pendingAttachments.value.push(attachment);

        try {
            // The backend issues the presign (it validates, rate-limits and
            // authenticates via JWT); the worker no longer trusts client headers.
            let presign: { uploadUrl: string; objectKey: string; cdnUrl: string };
            try {
                const response = await api.post('/attachments/presign', {
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type
                });
                presign = response.data;
            } catch (error: any) {
                const message: string = error?.response?.data?.error ?? 'Failed to get upload URL';
                updateAttachment(id, { status: 'error', error: message });
                throw new Error(message);
            }

            const { uploadUrl, objectKey, cdnUrl } = presign;
            updateAttachment(id, { uploadUrl, objectKey, cdnUrl, status: 'uploading' });

            // Upload file directly to presigned URL
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type
                }
            });

            if (!uploadResponse.ok) {
                updateAttachment(id, { status: 'error', error: 'Upload failed' });
                throw new Error('Upload failed');
            }

            updateAttachment(id, { status: 'completed' });
            return attachment;
        } catch (error) {
            // A network-level failure (e.g. the upload worker unreachable) throws
            // before either branch above runs, leaving the attachment stuck at
            // 'pending'/'uploading' forever with no error surfaced. Catch-all so
            // the UI always resolves to a visible state instead of hanging.
            const current = pendingAttachments.value.find(a => a.id === id);
            if (current && current.status !== 'error') {
                updateAttachment(id, { status: 'error', error: 'Network error while uploading' });
            }
            throw error;
        }
    }

    function removePendingAttachment(id: string) {
        const index = pendingAttachments.value.findIndex(a => a.id === id);
        if (index !== -1) {
            const [removed] = pendingAttachments.value.splice(index, 1);
            if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        }
    }

    function clearCompletedAttachments() {
        for (const a of pendingAttachments.value) {
            if (a.status === 'completed' && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
        pendingAttachments.value = pendingAttachments.value.filter(a => a.status !== 'completed');
    }

    function reset() {
        for (const a of pendingAttachments.value) {
            if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
        pendingAttachments.value = [];
    }

    return {
        pendingAttachments,
        uploadFile,
        removePendingAttachment,
        clearCompletedAttachments,
        reset,
    };
}

export type ChatAttachments = ReturnType<typeof useAttachments>;
