function timeSnak(date, precision = 11) {
  return {
    snaktype: "value",
    datavalue: {
      type: "time",
      value: {
        time: `+${date}T00:00:00Z`,
        timezone: 0,
        before: 0,
        after: 0,
        precision,
        calendarmodel: "http://www.wikidata.org/entity/Q1985727"
      }
    }
  };
}

function entitySnak(id) {
  return {
    snaktype: "value",
    datavalue: {
      type: "wikibase-entityid",
      value: { id, "entity-type": "item" }
    }
  };
}

function statement(snak, { ordinal = null, start = "" } = {}) {
  const qualifiers = {};
  if (ordinal !== null) {
    qualifiers.P1545 = [{
      snaktype: "value",
      datavalue: { type: "string", value: String(ordinal) }
    }];
  }
  if (start) qualifiers.P580 = [timeSnak(start)];
  return {
    rank: "normal",
    mainsnak: snak,
    ...(Object.keys(qualifiers).length ? { qualifiers } : {})
  };
}

function entity(id, label, description, claims = {}, aliases = []) {
  return {
    id,
    labels: { en: { language: "en", value: label } },
    descriptions: { en: { language: "en", value: description } },
    aliases: { en: aliases.map((value) => ({ language: "en", value })) },
    claims
  };
}

const ENTITIES = {
  QHOLIDAY: entity("QHOLIDAY", "Independence Day", "annual United States federal holiday", {
    P31: [statement(entitySnak("QHOLIDAYTYPE"))]
  }),
  QID4: entity("QID4", "Independence Day", "1996 film directed by Roland Emmerich", {
    P577: [statement(timeSnak("1996-07-03"))],
    P161: [
      statement(entitySnak("QWILL"), { ordinal: 1 }),
      statement(entitySnak("QJEFF"), { ordinal: 2 }),
      statement(entitySnak("QBILL"), { ordinal: 3 })
    ],
    P57: [statement(entitySnak("QROLAND"))]
  }, ["ID4"]),
  QWILL: entity("QWILL", "Will Smith", "American actor"),
  QJEFF: entity("QJEFF", "Jeff Goldblum", "American actor"),
  QBILL: entity("QBILL", "Bill Pullman", "American actor"),
  QROLAND: entity("QROLAND", "Roland Emmerich", "German film director"),

  QENTER: entity("QENTER", "Enter Sandman", "song by Metallica", {
    P577: [statement(timeSnak("1991-07-29"))],
    P175: [statement(entitySnak("QMETALLICA"))]
  }),
  QMETALLICA: entity("QMETALLICA", "Metallica", "American heavy metal band"),

  QQUAKE: entity("QQUAKE", "Quake", "1996 video game", {
    P577: [statement(timeSnak("1996-06-22"))],
    P178: [statement(entitySnak("QIDSOFT"))],
    P400: [
      statement(entitySnak("QDOS"), { start: "1996-06-22" }),
      statement(entitySnak("QSATURN"), { start: "1997-10-31" })
    ]
  }),
  QIDSOFT: entity("QIDSOFT", "id Software", "American video game developer"),
  QDOS: entity("QDOS", "DOS", "disk operating system"),
  QSATURN: entity("QSATURN", "Sega Saturn", "video game console"),

  QAPPLE: entity("QAPPLE", "Apple Computer", "American technology company", {
    P571: [statement(timeSnak("1976-04-01"))],
    P112: [statement(entitySnak("QJOBS")), statement(entitySnak("QWOZ")), statement(entitySnak("QWAYNE"))]
  }, ["Apple"]),
  QJOBS: entity("QJOBS", "Steve Jobs", "American business executive"),
  QWOZ: entity("QWOZ", "Steve Wozniak", "American engineer"),
  QWAYNE: entity("QWAYNE", "Ronald Wayne", "American businessman"),

  QFUTURE: entity("QFUTURE", "Future Movie XYZ", "1997 film", {
    P577: [statement(timeSnak("1997-03-01"))],
    P161: [statement(entitySnak("QTOM")), statement(entitySnak("QNIC"))]
  }),
  QTOM: entity("QTOM", "Tom Hanks", "American actor"),
  QNIC: entity("QNIC", "Nicolas Cage", "American actor")
};

const SEARCH_INDEX = new Map([
  ["independence day", ["QHOLIDAY", "QID4"]],
  ["id4", ["QID4"]],
  ["enter sandman", ["QENTER"]],
  ["quake", ["QQUAKE"]],
  ["apple computer", ["QAPPLE"]],
  ["apple", ["QAPPLE"]],
  ["future movie xyz", ["QFUTURE"]]
]);

function searchRows(term) {
  const ids = SEARCH_INDEX.get(String(term || "").trim().toLowerCase()) || [];
  return ids.map((id) => {
    const item = ENTITIES[id];
    return {
      id,
      label: item.labels.en.value,
      description: item.descriptions.en.value,
      aliases: (item.aliases?.en || []).map((entry) => entry.value),
      match: { type: "label", language: "en", text: item.labels.en.value }
    };
  });
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export function makeFakeWikidataFetch({ failAll = false, calls = null } = {}) {
  const log = Array.isArray(calls) ? calls : [];
  return async function fakeWikidataFetch(input) {
    const url = new URL(String(input));
    const action = url.searchParams.get("action") || "";
    log.push({
      action,
      search: url.searchParams.get("search") || "",
      ids: url.searchParams.get("ids") || ""
    });
    if (failAll) return response({ error: { code: "fixture-source-down" } }, 503);

    if (action === "wbsearchentities") {
      return response({
        searchinfo: { search: url.searchParams.get("search") || "" },
        search: searchRows(url.searchParams.get("search") || "")
      });
    }

    if (action === "wbgetentities") {
      const ids = String(url.searchParams.get("ids") || "").split("|").filter(Boolean);
      const entities = {};
      for (const id of ids) {
        if (ENTITIES[id]) entities[id] = ENTITIES[id];
        else entities[id] = { id, missing: "" };
      }
      return response({ entities });
    }

    return response({ error: { code: "fixture-unknown-action" } }, 400);
  };
}

export function fixtureEntitySnapshot() {
  return Object.values(ENTITIES).map((item) => ({
    id: item.id,
    label: item.labels?.en?.value || "",
    description: item.descriptions?.en?.value || ""
  }));
}
