// Shared open-modal stack for BaseModal instances. Plain module (not a
// component's <script setup>, whose top-level consts are re-created per
// instance) so the array is a true singleton across every BaseModal — needed
// so Escape only closes the most recently opened modal when several are
// stacked (e.g. a confirm dialog on top of a settings modal).
const stack: symbol[] = [];

export function pushModal(token: symbol): void {
  stack.push(token);
}

export function popModal(token: symbol): void {
  const idx = stack.indexOf(token);
  if (idx !== -1) stack.splice(idx, 1);
}

export function isTopModal(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token;
}
