export type SharedActor = 'xiaoci' | 'laoshi';

const ACTOR_OVERRIDE_KEY = 'shared_phone_actor_override';

export function resolveSharedActor(): SharedActor {
  if (typeof window === 'undefined') return 'xiaoci';

  try {
    const url = new URL(window.location.href);
    const queryActor = url.searchParams.get('actor');
    if (queryActor === 'laoshi' || queryActor === 'xiaoci') return queryActor;

    const override = window.localStorage.getItem(ACTOR_OVERRIDE_KEY);
    if (override === 'laoshi' || override === 'xiaoci') return override;

    if (url.pathname === '/teacher' || url.pathname.startsWith('/teacher/')) return 'laoshi';
  } catch {
    // Browser URL/localStorage failures fall through to the owner identity.
  }

  return 'xiaoci';
}

export function setSharedActorOverride(actor: SharedActor | null): void {
  if (typeof window === 'undefined') return;
  if (actor) window.localStorage.setItem(ACTOR_OVERRIDE_KEY, actor);
  else window.localStorage.removeItem(ACTOR_OVERRIDE_KEY);
}

export function sharedActorDisplayName(actor: SharedActor = resolveSharedActor()): string {
  return actor === 'laoshi' ? '老师' : '小词';
}
