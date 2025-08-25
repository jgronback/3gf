"use strict";

// Miljövariabler (Vercel):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE
// - ADMIN_TOKEN

module.exports = async (req, res) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

    if (req.method === "GET") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ error: "Missing id" });

      const { data: event, error: e1 } = await supabase
        .from("events")
        .select("id, name, date, place, pen_p, pen_h, pen_g")
        .eq("id", id)
        .single();
      if (e1 && e1.code !== "PGRST116") throw e1;

      const { data: people, error: e2 } = await supabase
        .from("people")
        .select("external_id, name, club, klass, laps")
        .eq("event_id", id);
      if (e2) throw e2;

      return res.json({ event: event || null, people: people || [] });
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
      const upEvent = {
        id,
        name: ev.name || null,
        date: ev.date || null,
        place: ev.place || null,
        pen_p: ev.penP ?? ev.pen_p ?? 0,
        pen_h: ev.penH ?? ev.pen_h ?? 0,
        pen_g: ev.penG ?? ev.pen_g ?? 0
      };

      // Upsert event
      const { error: eUp } = await supabase.from("events").upsert(upEvent);
      if (eUp) throw eUp;

      // Replace people for this event
      const people = (Array.isArray(body.people) ? body.people : []).map(p => ({
        event_id: id,
        external_id: p.id,
        name: p.name,
        club: p.club || null,
        klass: p.klass || null,
        laps: p.laps || []
      }));

      const { error: eDel } = await supabase.from("people").delete().eq("event_id", id);
      if (eDel) throw eDel;

      if (people.length) {
        const { error: eIns } = await supabase.from("people").insert(people);
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
