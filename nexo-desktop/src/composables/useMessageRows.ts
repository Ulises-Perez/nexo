import { computed, type ComputedRef, type Ref } from 'vue';
import type { ChatMessage } from '../stores/chat';
import { isSameDayMs, isTimeDiffLargeMs, formatTimestamp, formatDateSeparator, formatCompactTime } from './messageFormat';

export interface MessageRow {
    msg: ChatMessage;
    key: string;               // msg.id
    showDateSeparator: boolean;
    dateLabel: string;         // only when showDateSeparator
    grouped: boolean;          // same author, same day, <= 5 min since previous
    timeLabel: string;         // formatted time (compact when grouped, full otherwise)
    color: string;             // username color
}

type MessagesSource = Ref<ChatMessage[]> | (() => ChatMessage[]);

// Builds the precomputed row list consumed by MessageList.vue in ONE pass,
// so the template never re-derives grouping/separator state per render.
// `createdAt` is parsed once per message (Date.parse) instead of repeatedly
// re-parsed by isSameDay/isTimeDiffLarge/toLocaleTimeString calls in-template.
export function useMessageRows(
    messagesSource: MessagesSource,
    colorFor: (msg: ChatMessage) => string
): ComputedRef<MessageRow[]> {
    return computed<MessageRow[]>(() => {
        const messages = typeof messagesSource === 'function' ? messagesSource() : messagesSource.value;
        const rows: MessageRow[] = [];

        let prevMsg: ChatMessage | null = null;
        let prevTs = 0;

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const ts = Date.parse(msg.createdAt);

            const sameDayAsPrev = prevMsg !== null && isSameDayMs(ts, prevTs);
            const grouped = prevMsg !== null
                && prevMsg.userId === msg.userId
                && sameDayAsPrev
                && !isTimeDiffLargeMs(ts, prevTs);
            const showDateSeparator = prevMsg === null || !sameDayAsPrev;

            rows.push({
                msg,
                key: msg.id,
                showDateSeparator,
                dateLabel: showDateSeparator ? formatDateSeparator(msg.createdAt) : '',
                grouped,
                timeLabel: grouped ? formatCompactTime(ts) : formatTimestamp(msg.createdAt),
                color: colorFor(msg),
            });

            prevMsg = msg;
            prevTs = ts;
        }

        return rows;
    });
}
