from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"patch target not found: {label}")
    return text.replace(old, new, 1)


social_path = Path("src/social.js")
social = social_path.read_text()

old_header = '''const TZ_OFFSETS = { ET: -5, CT: -6, MT: -7, PT: -8 };
const REAL_ANCHOR = Date.UTC(2026, 7, 19, 7, 0, 0);
const WORLD_ANCHOR = Date.UTC(1996, 10, 22, 8, 0, 0);
const WORLD_YEAR_START = Date.UTC(1996, 0, 1, 8, 0, 0);
const WORLD_YEAR_MS = Date.UTC(1997, 0, 1, 8, 0, 0) - WORLD_YEAR_START;
'''
new_header = '''import {
  mirrorWorldMs,
  mirrorDateLabel,
  mirrorDateTimeLabel,
  mirrorLocalParts,
  calendarContext
} from "./calendar.js";
'''
social = replace_once(social, old_header, new_header, "social calendar imports")

old_clock = '''export function simulatedWorldMs(now = Date.now()) {
  const elapsed = ((now - REAL_ANCHOR) % WORLD_YEAR_MS + WORLD_YEAR_MS) % WORLD_YEAR_MS;
  const anchorOffset = WORLD_ANCHOR - WORLD_YEAR_START;
  const yearOffset = (anchorOffset + elapsed) % WORLD_YEAR_MS;
  return WORLD_YEAR_START + yearOffset;
}

export function simulatedDateLabel(now = Date.now()) {
  const d = new Date(simulatedWorldMs(now) - 8 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(d);
}

export function simulatedDateTimeLabel(now = Date.now()) {
  const d = new Date(simulatedWorldMs(now) - 8 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(d);
}

function localWorldParts(character, now = Date.now()) {
  const offset = TZ_OFFSETS[character?.timezone] ?? -5;
  const d = new Date(simulatedWorldMs(now) + offset * 60 * 60 * 1000);
  return {
    day: d.getUTCDay(),
    hour: d.getUTCHours() + d.getUTCMinutes() / 60,
    dateKey: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
  };
}
'''
new_clock = '''export function simulatedWorldMs(now = Date.now()) {
  return mirrorWorldMs(now);
}

export function simulatedDateLabel(now = Date.now()) {
  return mirrorDateLabel(now);
}

export function simulatedDateTimeLabel(now = Date.now()) {
  const context = calendarContext(now, "PT");
  return `${mirrorDateTimeLabel(now)}. ${context.prompt} Mirror-calendar rule: month, day, weekday, time, and holiday status follow the live calendar; everyone still believes the year is 1996.`;
}

function localWorldParts(character, now = Date.now()) {
  return mirrorLocalParts(character?.timezone || "ET", now);
}
'''
social = replace_once(social, old_clock, new_clock, "social mirror clock")

old_weekend = '''  const weekend = local.day === 0 || local.day === 6;
  const start = weekend ? schedule.weekendStart : schedule.weekdayStart;
'''
new_weekend = '''  const calendar = calendarContext(now, character?.timezone || "ET");
  const weekend = local.day === 0 || local.day === 6 || calendar.dayOff;
  const start = weekend ? schedule.weekendStart : schedule.weekdayStart;
'''
social = replace_once(social, old_weekend, new_weekend, "holiday-aware schedules")

old_score = '''  return (inside ? 76 : 15) + stableNoise + (character.personality?.sociability || 0.5) * 12;
'''
new_score = '''  return (inside ? 76 : 15) + stableNoise + (character.personality?.sociability || 0.5) * 12 + (calendar.dayOff ? 8 : 0);
'''
social = replace_once(social, old_score, new_score, "holiday roster boost")

social_path.write_text(social)

index_path = Path("src/index.js")
index = index_path.read_text()

old_import = '''} from "./chatter.js";
import {
  normalizeSocialState,
'''
new_import = '''} from "./chatter.js";
import { calendarChatterLine } from "./calendar.js";
import {
  normalizeSocialState,
'''
index = replace_once(index, old_import, new_import, "calendar chatter import")

old_ambient = '''      const text = chooseDistinctLine(
        () => react ? renderReaction(character, recent) : renderAmbient(character),
        this.history,
'''
new_ambient = '''      const text = chooseDistinctLine(
        () => {
          const seasonal = Math.random() < 0.28 ? calendarChatterLine(character, Date.now()) : null;
          return seasonal || (react ? renderReaction(character, recent) : renderAmbient(character));
        },
        this.history,
'''
index = replace_once(index, old_ambient, new_ambient, "built-in holiday chatter")

old_health = '''        characterCount: CHARACTERS.length,
        pass: 2
'''
new_health = '''        characterCount: CHARACTERS.length,
        calendarMode: "live-calendar-mirrored-to-1996",
        pass: 2
'''
index = replace_once(index, old_health, new_health, "health calendar mode")

index_path.write_text(index)

package_path = Path("package.json")
package = package_path.read_text()
package = package.replace(
    '"check": "node --check src/characters.js && node --check src/chatter.js && node --check src/index.js && node --check public/app.js"',
    '"check": "node --check src/calendar.js && node --check src/characters.js && node --check src/chatter.js && node --check src/index.js && node --check public/app.js"'
)
package_path.write_text(package)

readme_path = Path("README.md")
readme = readme_path.read_text()
marker = "## Mirror calendar and holidays"
if marker not in readme:
    readme += '''\n\n## Mirror calendar and holidays\n\nThe room now uses a **live mirror calendar** rather than advancing through an independent 1996 calendar. The current real-world month, day, weekday, and clock time are mirrored into the room while the year is always displayed and understood as **1996**. This is intentionally an alternate/mirrored 1996 calendar, not a claim that the historical weekday for a date in 1996 was the same.\n\nThat keeps the room socially synchronized with the present day: if it is Friday night now, it is Friday night in the room; if today is Thanksgiving on the live calendar, the room treats today as Thanksgiving in its 1996 world. Major US holidays and common cultural dates are recognized with period-appropriate names and context, including New Year's, MLK Day, Valentine's Day, Presidents Day, St. Patrick's Day, Easter, Mother's/Father's Day, Memorial Day, Independence Day, Labor Day, Columbus Day, Halloween, Veterans Day, Thanksgiving, Christmas, and New Year's Eve. Weekend-observed federal holidays are also considered.\n\nHoliday status affects schedules as well as conversation. A normal weekday holiday can behave more like a weekend for character availability, and both Groq and the built-in chatter engine can naturally mention holiday plans, food, family, shopping, parties, travel, or time off. Seasonal context such as summer, back-to-school, Halloween season, Thanksgiving week, and Christmas shopping is also available, but it is probabilistic so the room does not talk about the holiday every line.\n\nThe holiday vocabulary intentionally stays compatible with a 1996 worldview. The room does not automatically import modern holiday terminology or later cultural conventions just because the live calendar has them.\n'''
    readme_path.write_text(readme)

print("Applied mirror-calendar and holiday patch")
