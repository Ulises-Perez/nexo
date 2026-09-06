// Formatting helpers for the message timeline. Extracted from MessageList.vue
// so the row-building pass in useMessageRows.ts can reuse them without
// duplicating logic, and so MessageList's template no longer calls them
// per-row (that work is precomputed once per message instead).

export const isSameDay = (date1: string, date2: string): boolean => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear()
        && d1.getMonth() === d2.getMonth()
        && d1.getDate() === d2.getDate();
};

export const isTimeDiffLarge = (date1: string, date2: string): boolean => {
    const diff = Math.abs(new Date(date1).getTime() - new Date(date2).getTime());
    return diff > 5 * 60 * 1000; // 5 minutos
};

// Timestamp-based variants: avoid re-parsing the same createdAt string twice
// when the caller already has both messages' parsed timestamps at hand.
export const isSameDayMs = (t1: number, t2: number): boolean => {
    const d1 = new Date(t1);
    const d2 = new Date(t2);
    return d1.getFullYear() === d2.getFullYear()
        && d1.getMonth() === d2.getMonth()
        && d1.getDate() === d2.getDate();
};

export const isTimeDiffLargeMs = (t1: number, t2: number): boolean => {
    return Math.abs(t1 - t2) > 5 * 60 * 1000; // 5 minutos
};

export const formatDateSeparator = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(dateStr, now.toISOString())) return 'Hoy';
    if (isSameDay(dateStr, yesterday.toISOString())) return 'Ayer';

    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
};

export const formatTimestamp = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isSameDay(dateStr, now.toISOString())) return `Hoy a las ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(dateStr, yesterday.toISOString())) return `Ayer a las ${time}`;

    return `${date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${time}`;
};

// Compact HH:mm used for the hover timestamp shown on grouped rows (avatar
// column is collapsed, so the full "Hoy a las..." label would not fit).
export const formatCompactTime = (ms: number): string => {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const getUsernameColor = (username: string): string => {
    const colors = [
        '#e74c8b', '#e8a52e', '#43b581', '#5865f2', '#ed4245',
        '#f47b67', '#9b59b6', '#1abc9c', '#e67e22', '#3498db',
        '#2ecc71', '#e91e63', '#ff7043', '#ab47bc', '#26c6da',
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};
