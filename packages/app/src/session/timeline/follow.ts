import { createMemo, createSignal, untrack, type Accessor, type Signal } from "solid-js"
import {
  CONTACT_LOST_EVENT,
  createFollowState,
  followAnchor,
  isFollowing,
  transitionFollow,
  type FollowEvent,
  type FollowState,
} from "./machine"

// More than the timeline cache keeps views: a session whose view went can still come back to the end or to its place.
const KEPT_SESSIONS = 64

// Each session has its own machine, and the state its reader left it in is kept while another session is selected: a
// reader who had scrolled up comes back to their place, and one who followed comes back to the end. A session opened
// for the first time starts out following. Reading the state recomputes it for a changed key, so a view that mounts
// for a session starts from that session's state, whatever order the flush runs its computations in.
export function createTimelineFollow(sessionKey: Accessor<string>) {
  const left = new Map<string, FollowState>()

  const machine = createMemo<{ key: string; signal: Signal<FollowState> }>((previous) => {
    const key = sessionKey()

    if (previous) {
      left.delete(previous.key)
      left.set(previous.key, untrack(previous.signal[0]))

      if (left.size > KEPT_SESSIONS) left.delete(left.keys().next().value!)
    }

    // The reader's contact with the timeline ended when they left the session.
    return { key, signal: createSignal(transitionFollow(left.get(key) ?? createFollowState(), CONTACT_LOST_EVENT)) }
  })

  const state = () => machine().signal[0]()
  const peek = () => untrack(state)
  const following = createMemo(() => isFollowing(state()))
  const anchor = createMemo(() => followAnchor(state()))
  let attempts = 0

  // The signal skips an unchanged state, which the transition returns as the same object.
  const dispatch = (event: FollowEvent) => {
    untrack(machine).signal[1](transitionFollow(peek(), event))
  }

  return {
    state,
    peek,
    following,
    anchor,
    dispatch,
    /** Queues a return to the end and returns its attempt, which the frame that scrolls hands back in `return.run`. */
    beginReturn: () => {
      attempts += 1
      dispatch({ type: "return.start", attempt: attempts })

      return attempts
    },
  }
}

export type TimelineFollow = ReturnType<typeof createTimelineFollow>
