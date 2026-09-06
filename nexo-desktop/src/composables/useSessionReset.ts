import { useChatStore } from '../stores/chat';
import { useFriendsStore } from '../stores/friends';
import { useCommunityStore } from '../stores/community';
import { useVoiceStore } from '../stores/voice';
import { useScreenShareStore } from '../stores/screenShare';
import { useUsersStore } from '../stores/users';
import { clearDMProfileCache } from './dmProfileCache';

// Single place that wipes every per-user store so nothing from one account
// leaks into the next login on the same machine (logout, socket auth
// rejection). Stores are resolved lazily inside the function body: this
// module and stores/chat.ts import each other, and touching a store at
// module-evaluation time would hit an uninitialized binding.
//
// Order matters: voice and screen share tear down first so their
// 'leave_voice' / 'stop_screen_share' notifications go out over the still
// live socket; chat.reset() then disconnects it and clears the rest.
// Does not remove the auth token: callers decide (see UserPanel logout).
export function resetSessionState(): void {
    useScreenShareStore().unbindSocket();
    useVoiceStore().unbindSocket();
    useChatStore().reset();
    useFriendsStore().reset();
    useCommunityStore().reset();
    useUsersStore().reset();
    clearDMProfileCache();
}
