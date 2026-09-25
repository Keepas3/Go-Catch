import type { LeekDuckEvent, NewsItem } from "./types.js";

const RECENT_WINDOW_DAYS = 14;
const UPCOMING_WINDOW_DAYS = 30;
const MAX_ITEMS = 20;

/**
 * Turns LeekDuck's raw event list into two simple news feeds: what's live/starting
 * soon, and what wrapped up recently. Separate from buildSpawnPool's own event
 * lookahead window -- this is just for display, not spawn-pool inclusion.
 */
export function buildNews(events: LeekDuckEvent[], now: Date = new Date()): { upcoming: NewsItem[]; recent: NewsItem[] } {
  const upcoming: NewsItem[] = [];
  const recent: NewsItem[] = [];

  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const daysSinceEnd = (now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24);
    const daysUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    const item: NewsItem = {
      eventID: event.eventID,
      name: event.name,
      eventType: event.eventType,
      heading: event.heading,
      link: event.link,
      start: event.start,
      end: event.end,
      status: start <= now && now <= end ? "live" : start > now ? "upcoming" : "ended",
    };

    if (item.status === "ended") {
      if (daysSinceEnd <= RECENT_WINDOW_DAYS) recent.push(item);
    } else if (daysUntilStart <= UPCOMING_WINDOW_DAYS) {
      upcoming.push(item);
    }
  }

  upcoming.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  recent.sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());

  return { upcoming: upcoming.slice(0, MAX_ITEMS), recent: recent.slice(0, MAX_ITEMS) };
}
