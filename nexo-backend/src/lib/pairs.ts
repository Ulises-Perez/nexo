// Canonical ordering helpers for symmetric user pairs (Friendship, Conversation).
// New rows always store the pair as [min, max] by string compare; reads keep
// checking both orders (pairWhere) so legacy, pre-normalization rows still match.

export function normalizePair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
}

export function pairWhere(a: string, b: string) {
    return {
        OR: [
            { userAId: a, userBId: b },
            { userAId: b, userBId: a },
        ],
    };
}
