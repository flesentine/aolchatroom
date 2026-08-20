const ZONES = {
  ET: "America/New_York",
  CT: "America/Chicago",
  MT: "America/Denver",
  PT: "America/Los_Angeles"
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIRROR_YEAR = 1996;
const ROOM_ZONE = "PT";

function zoneName(zone = ROOM_ZONE) {
  return ZONES[zone] || ZONES.PT;
}

function zonedParts(now = Date.now(), zone = ROOM_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneName(zone),
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(now))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    realYear: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(year, month, day, amount) {
  const d = utcDate(year, month, day);
  d.setUTCDate(d.getUTCDate() + amount);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function nthWeekday(year, month, weekday, nth) {
  const first = utcDate(year, month, 1);
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return 1 + delta + (nth - 1) * 7;
}

function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
}

function easterDate(year) {
  // Gregorian computus (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function observedDate(year, month, day) {
  const d = utcDate(year, month, day);
  if (d.getUTCDay() === 6) return addDays(year, month, day, -1);
  if (d.getUTCDay() === 0) return addDays(year, month, day, 1);
  return { year, month, day };
}

function pushHoliday(list, year, month, day, name, options = {}) {
  list.push({
    key: dateKey(year, month, day),
    year,
    month,
    day,
    name,
    dayOff: Boolean(options.dayOff),
    social: options.social !== false,
    major: Boolean(options.major),
    observed: false
  });

  if (options.observe) {
    const observed = observedDate(year, month, day);
    if (observed.month !== month || observed.day !== day) {
      list.push({
        key: dateKey(observed.year, observed.month, observed.day),
        year: observed.year,
        month: observed.month,
        day: observed.day,
        name: `${name} observed`,
        baseName: name,
        dayOff: true,
        social: true,
        major: Boolean(options.major),
        observed: true
      });
    }
  }
}

function holidayCalendar(year) {
  const rows = [];
  pushHoliday(rows, year, 1, 1, "New Year's Day", { dayOff: true, major: true, observe: true });
  pushHoliday(rows, year, 1, nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day", { dayOff: true });
  pushHoliday(rows, year, 2, 14, "Valentine's Day", { social: true });
  pushHoliday(rows, year, 2, nthWeekday(year, 2, 1, 3), "Presidents Day", { dayOff: true });
  pushHoliday(rows, year, 3, 17, "St. Patrick's Day", { social: true });

  const easter = easterDate(year);
  pushHoliday(rows, year, easter.month, easter.day, "Easter Sunday", { social: true, major: true });
  pushHoliday(rows, year, 5, nthWeekday(year, 5, 0, 2), "Mother's Day", { social: true });
  pushHoliday(rows, year, 5, lastWeekday(year, 5, 1), "Memorial Day", { dayOff: true, major: true });
  pushHoliday(rows, year, 6, nthWeekday(year, 6, 0, 3), "Father's Day", { social: true });
  pushHoliday(rows, year, 7, 4, "Independence Day", { dayOff: true, major: true, observe: true });
  pushHoliday(rows, year, 9, nthWeekday(year, 9, 1, 1), "Labor Day", { dayOff: true, major: true });
  pushHoliday(rows, year, 10, nthWeekday(year, 10, 1, 2), "Columbus Day", { dayOff: true });
  pushHoliday(rows, year, 10, 31, "Halloween", { social: true, major: true });
  pushHoliday(rows, year, 11, 11, "Veterans Day", { dayOff: true, observe: true });
  pushHoliday(rows, year, 11, nthWeekday(year, 11, 4, 4), "Thanksgiving", { dayOff: true, major: true });
  pushHoliday(rows, year, 12, 24, "Christmas Eve", { social: true, major: true });
  pushHoliday(rows, year, 12, 25, "Christmas Day", { dayOff: true, major: true, observe: true });
  pushHoliday(rows, year, 12, 31, "New Year's Eve", { social: true, major: true });
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

function daysBetween(a, b) {
  const aa = Date.UTC(a.year, a.month - 1, a.day, 12, 0, 0);
  const bb = Date.UTC(b.year, b.month - 1, b.day, 12, 0, 0);
  return Math.round((bb - aa) / 86400000);
}

function seasonalTags(parts, holidays) {
  const tags = [];
  const md = parts.month * 100 + parts.day;
  if (md >= 605 && md <= 905) tags.push("summer");
  if (md >= 815 && md <= 915) tags.push("back-to-school season");
  if (md >= 1020 && md <= 1031) tags.push("Halloween season");
  if (md >= 1201 && md <= 1225) tags.push("Christmas season and holiday shopping");
  if (md >= 1226 || md <= 103) tags.push("New Year's week");

  const thanksgiving = holidays.find((h) => h.name === "Thanksgiving");
  if (thanksgiving) {
    const delta = Math.abs(daysBetween(parts, thanksgiving));
    if (delta <= 4 && !tags.includes("Thanksgiving week")) tags.push("Thanksgiving week");
  }
  return tags;
}

export function calendarContext(now = Date.now(), zone = ROOM_ZONE) {
  const parts = zonedParts(now, zone);
  const holidays = holidayCalendar(parts.realYear);
  const todayKey = dateKey(parts.realYear, parts.month, parts.day);
  const holiday = holidays.find((row) => row.key === todayKey) || null;

  const today = { year: parts.realYear, month: parts.month, day: parts.day };
  const upcoming = holidays
    .map((row) => ({ row, days: daysBetween(today, row) }))
    .filter((entry) => entry.days > 0 && entry.days <= 7 && entry.row.social)
    .sort((a, b) => a.days - b.days)[0] || null;

  const recent = holidays
    .map((row) => ({ row, days: daysBetween(row, today) }))
    .filter((entry) => entry.days > 0 && entry.days <= 2 && entry.row.major)
    .sort((a, b) => a.days - b.days)[0] || null;

  const tags = seasonalTags(parts, holidays);
  const dayOff = Boolean(holiday?.dayOff);
  let prompt = "No special holiday today.";
  if (holiday) {
    prompt = `Today is ${holiday.name}. ${dayOff ? "Many people have the day off or altered work/school plans." : "It can naturally come up in casual conversation."}`;
  } else if (upcoming) {
    prompt = `${upcoming.row.name} is ${upcoming.days === 1 ? "tomorrow" : `in ${upcoming.days} days`}. People may mention plans, shopping, family, parties, food, travel, or time off without forcing the topic.`;
  } else if (recent) {
    prompt = `${recent.row.name} was ${recent.days === 1 ? "yesterday" : `${recent.days} days ago`}. People may casually mention what they did.`;
  }
  if (tags.length) prompt += ` Seasonal context: ${tags.join(", ")}.`;

  return {
    mirrorYear: MIRROR_YEAR,
    realYear: parts.realYear,
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    hour: parts.hour,
    minute: parts.minute,
    holiday,
    upcomingHoliday: upcoming?.row || null,
    daysUntilUpcoming: upcoming?.days ?? null,
    dayOff,
    tags,
    prompt
  };
}

export function mirrorWorldMs(now = Date.now()) {
  // Used only as a stable 1996 timestamp for hashing. The public calendar mirrors
  // the current month/day/weekday/time and changes only the displayed year.
  const p = zonedParts(now, ROOM_ZONE);
  return Date.UTC(MIRROR_YEAR, p.month - 1, p.day, p.hour, p.minute, p.second);
}

export function mirrorDateLabel(now = Date.now()) {
  const p = zonedParts(now, ROOM_ZONE);
  return `${MONTHS[p.month - 1]} ${p.day}, ${MIRROR_YEAR}`;
}

export function mirrorDateTimeLabel(now = Date.now()) {
  const p = zonedParts(now, ROOM_ZONE);
  const h12 = p.hour % 12 || 12;
  const suffix = p.hour >= 12 ? "PM" : "AM";
  const context = calendarContext(now, ROOM_ZONE);
  const special = context.holiday ? ` — ${context.holiday.name}` : context.tags.length ? ` — ${context.tags.join(", ")}` : "";
  return `${p.weekday}, ${MONTHS[p.month - 1]} ${p.day}, ${MIRROR_YEAR}, ${h12}:${String(p.minute).padStart(2, "0")} ${suffix}${special}`;
}

export function mirrorLocalParts(zone = ROOM_ZONE, now = Date.now()) {
  const p = zonedParts(now, zone);
  const weekdayIndex = WEEKDAYS.indexOf(p.weekday);
  return {
    day: weekdayIndex >= 0 ? weekdayIndex : 0,
    hour: p.hour + p.minute / 60,
    dateKey: `${MIRROR_YEAR}-${p.month}-${p.day}`,
    realYear: p.realYear,
    month: p.month,
    date: p.day,
    weekday: p.weekday
  };
}

const HOLIDAY_CHAT = {
  "New Year's Day": ["happy new year", "anybody make resolutions", "i slept way too late lol", "new year same room"],
  "Martin Luther King Jr. Day": ["anyone off work today", "nice having monday off", "school is out here today"],
  "Valentine's Day": ["happy valentines i guess lol", "anyone actually have plans tonight", "valentines is overrated", "who got flowers"],
  "Presidents Day": ["anyone else off today", "three day weekend rules", "stores are packed today"],
  "St. Patrick's Day": ["everyone wearing green today?", "happy st patricks day", "downtown is gonna be nuts tonight"],
  "Easter Sunday": ["happy easter", "family dinner later", "anyone else eating way too much today"],
  "Mother's Day": ["did everyone call their mom", "happy mothers day to the moms", "family stuff all day here"],
  "Memorial Day": ["anyone bbq today", "long weekend went too fast", "who actually has today off", "summer basically starts now lol"],
  "Father's Day": ["did everyone call their dad", "happy fathers day", "family dinner again lol"],
  "Independence Day": ["happy 4th", "anyone going to fireworks", "bbq later", "fireworks already going off here lol"],
  "Labor Day": ["anyone bbq today", "who actually has work today", "long weekend went too fast", "last summer weekend basically"],
  "Columbus Day": ["anyone else off today", "school is out here", "three day weekend was nice"],
  "Halloween": ["happy halloween", "anyone dressing up tonight", "who has candy already", "halloween parties tonight?"],
  "Veterans Day": ["anyone off today", "school is out here today", "quiet day here"],
  "Thanksgiving": ["happy thanksgiving", "im so full lol", "turkey coma", "family is driving me nuts", "what did everyone eat"],
  "Christmas Eve": ["merry christmas eve", "anyone still wrapping gifts", "family is everywhere", "christmas tomorrow finally"],
  "Christmas Day": ["merry christmas", "what did everyone get", "anyone hiding from family on aol lol", "christmas dinner destroyed me"],
  "New Year's Eve": ["what is everyone doing tonight", "new years plans?", "anyone going to a party", "see u all next year lol"]
};

export function calendarChatterLine(character, now = Date.now()) {
  const context = calendarContext(now, character?.timezone || ROOM_ZONE);
  const holidayName = context.holiday?.baseName || context.holiday?.name;
  const direct = holidayName ? HOLIDAY_CHAT[holidayName] : null;
  if (direct?.length) return direct[Math.floor(Math.random() * direct.length)];

  if (context.upcomingHoliday && context.daysUntilUpcoming != null) {
    const name = context.upcomingHoliday.name.toLowerCase();
    if (/thanksgiving/.test(name)) return ["any thanksgiving plans", "who is traveling for thanksgiving", "cant wait for thanksgiving food"][Math.floor(Math.random() * 3)];
    if (/christmas/.test(name)) return ["still need christmas gifts", "anyone done christmas shopping", "christmas is coming way too fast"][Math.floor(Math.random() * 3)];
    if (/halloween/.test(name)) return ["any halloween plans", "still need a costume", "halloween is almost here"][Math.floor(Math.random() * 3)];
    if (/independence/.test(name)) return ["any plans for the 4th", "who is doing fireworks", "need bbq plans for the 4th"][Math.floor(Math.random() * 3)];
  }

  if (context.tags.includes("back-to-school season") && Math.random() < 0.5) {
    return ["school starting already?", "summer went too fast", "back to school traffic is awful"][Math.floor(Math.random() * 3)];
  }
  if (context.tags.includes("summer") && Math.random() < 0.35) {
    return ["summer is going way too fast", "anyone going anywhere this summer", "too hot to do anything today"][Math.floor(Math.random() * 3)];
  }
  if (context.tags.includes("Christmas season and holiday shopping") && Math.random() < 0.5) {
    return ["mall is insane for christmas", "i still need gifts", "christmas shopping is killing me"][Math.floor(Math.random() * 3)];
  }
  return null;
}

export const MIRROR_CALENDAR_YEAR = MIRROR_YEAR;
