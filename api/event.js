"use strict";

// Vercel Edge/Node function
// Miljövariabler som används:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE
// - ADMIN_TOKEN 

module.exports = async (req, res) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    if (req.method === "GET") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ error: "Missing id" });

      // Hämta event
      const { data: evt, error: e1 } = await client
        .from("events")
        .select("id, name, date, place, pen_p, pen_h, pen_g")
        .eq("id", id)
        .single();

      if (e1 && e1.code !== "PGRST116") throw e1; // ignorera "not found"

      // Hämta people
      const { data: ppl, error: e2 } = await client
        .from("people")
        .select("external_id, name, club, klass, laps")
        .eq("event_id", id);

      if (e2) throw e2;

      return res.json({ event: evt || null, people: ppl || [] });
    }

    if (req.method === "POST") {
      const admin = req.headers["x-admin-token"];
      if (!admin || admin !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ error: "Missing id" });

      const body = req.body || {};
      const ev = body.event || {};

      // Upsert event
      const upEvent = {
        id,
        name: ev.name || null,
        date: ev.date || null,
        place: ev.place || null,
        pen_p: ev.penP ?? ev.pen_p ?? 0,
        pen_h: ev.penH ?? ev.pen_h ?? 0,
        pen_g: ev.penG ?? ev.pen_g ?? 0
      };

      let { error: eUp } = await client.from("events").upsert(upEvent);
      if (eUp) throw eUp;

      // Ersätt people
      const people = (body.people || []).map(p => ({
        event_id: id,
        external_id: p.id,
        name: p.name,
        club: p.club || null,
        klass: p.klass || null,
        laps: p.laps || []
      }));

      let { error: eDel } = await client.from("people").delete().eq("event_id", id);
      if (eDel) throw eDel;

      if (people.length) {
        let { error: eIns } = await client.from("people").insert(people);
        if (eIns) throw eIns;
      }

      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error", details: String((err && err.message) || err) });
  }
};
