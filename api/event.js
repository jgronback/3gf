// /api/event.js
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // Enkelt skydd: kräver ADMIN_TOKEN för skrivningar
  if (req.method === 'POST') {
    const token = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
    if (!token || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data: ev, error: e1 } = await supa
        .from('events').select('*').eq('event_id', id).single();
      // e1.code === 'PGRST116' = no rows; det är ok
      if (e1 && e1.code !== 'PGRST116') throw e1;

      const { data: parts, error: e2 } = await supa
        .from('participants').select('*').eq('event_id', id).order('name');
      if (e2) throw e2;

      const { data: laps, error: e3 } = await supa
        .from('laps').select('*').eq('event_id', id).order('lap_index');
      if (e3) throw e3;

      const map = {};
      (parts || []).forEach(p => {
        map[p.external_id] = {
          external_id: p.external_id,
          name: p.name,
          club: p.club,
          klass: p.class,
          laps: []
        };
      });
      (laps || []).forEach(r => {
        const t = map[r.external_id];
        if (!t) return;
        t.laps.push({
          tP: +r.t_p || 0, mP: +r.m_p || 0,
          tH: +r.t_h || 0, mH: +r.m_h || 0,
          tG: +r.t_g || 0, mG: +r.m_g || 0,
          pt: +r.pt  || 0
        });
      });

      return res.status(200).json({ event: ev || null, people: Object.values(map) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const ev = body.event || {};
      const people = Array.isArray(body.people) ? body.people : [];

      // upsert event
      const row = {
        event_id: id,
        name: ev.name || null,
        date: ev.date || null,
        place: ev.place || null,
        pen_p: +ev.penP || 0,
        pen_h: +ev.penH || 0,
        pen_g: +ev.penG || 0
      };
      const { error: u1 } = await supa.from('events').upsert(row, { onConflict: 'event_id' });
      if (u1) throw u1;

      // upsert participants
      const partRows = people.map(p => ({
        event_id: id,
        external_id: p.id,
        name: p.name,
        club: p.club || '',
        class: p.klass || ''
      }));
      if (partRows.length) {
        const { error: u2 } = await supa
          .from('participants').upsert(partRows, { onConflict: 'event_id,external_id' });
        if (u2) throw u2;
      }

      // replace laps
      const { error: d1 } = await supa.from('laps').delete().eq('event_id', id);
      if (d1) throw d1;

      const allLaps = [];
      people.forEach(p => (p.laps || []).forEach((v, idx) => {
        allLaps.push({
          event_id: id, external_id: p.id, lap_index: idx + 1,
          t_p: +v.tP || 0, m_p: +v.mP || 0,
          t_h: +v.tH || 0, m_h: +v.mH || 0,
          t_g: +v.tG || 0, m_g: +v.mG || 0,
          pt: +v.pt  || 0
        });
      }));
      if (allLaps.length) {
        const { error: i1 } = await supa.from('laps').insert(allLaps);
        if (i1) throw i1;
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
