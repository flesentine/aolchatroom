function timeSnak(date) {
  return {
    snaktype: "value",
    datavalue: {
      type: "time",
      value: {
        time: `+${date}T00:00:00Z`,
        timezone: 0,
        before: 0,
        after: 0,
        precision: 11,
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

function statement(mainsnak) {
  return { rank: "normal", mainsnak };
}

const ENTITIES = {
  QCOLLISION1: {
    id: "QCOLLISION1",
    labels: { en: { language: "en", value: "Collision Title" } },
    descriptions: { en: { language: "en", value: "1988 film" } },
    claims: {
      P577: [statement(timeSnak("1988-03-01"))],
      P57: [statement(entitySnak("QDIRECTOR1"))]
    }
  },
  QCOLLISION2: {
    id: "QCOLLISION2",
    labels: { en: { language: "en", value: "Collision Title" } },
    descriptions: { en: { language: "en", value: "1994 film" } },
    claims: {
      P577: [statement(timeSnak("1994-08-12"))],
      P57: [statement(entitySnak("QDIRECTOR2"))]
    }
  },
  QDIRECTOR1: {
    id: "QDIRECTOR1",
    labels: { en: { language: "en", value: "Director One" } },
    claims: {}
  },
  QDIRECTOR2: {
    id: "QDIRECTOR2",
    labels: { en: { language: "en", value: "Director Two" } },
    claims: {}
  }
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export function makeSameTitleAmbiguityFetch() {
  return async function sameTitleAmbiguityFetch(input) {
    const url = new URL(String(input));
    const action = url.searchParams.get("action") || "";
    if (action === "wbsearchentities") {
      const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
      if (search !== "collision title") return response({ search: [] });
      return response({
        search: ["QCOLLISION1", "QCOLLISION2"].map((id) => ({
          id,
          label: "Collision Title",
          description: ENTITIES[id].descriptions.en.value,
          aliases: [],
          match: { type: "label", language: "en", text: "Collision Title" }
        }))
      });
    }
    if (action === "wbgetentities") {
      const ids = String(url.searchParams.get("ids") || "").split("|").filter(Boolean);
      const entities = {};
      for (const id of ids) entities[id] = ENTITIES[id] || { id, missing: "" };
      return response({ entities });
    }
    return response({ error: { code: "fixture-unknown-action" } }, 400);
  };
}
