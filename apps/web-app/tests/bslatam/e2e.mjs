#!/usr/bin/env node
import fetch from 'node-fetch';

const base = process.env.BASE_URL || 'http://localhost:3000';
const speakerId = process.env.SPEAKER_ID || 'speaker-1';
const attendeeId = process.env.ATTENDEE_ID;
if (!attendeeId) {
  console.error('Set ATTENDEE_ID to a valid Supabase auth user id');
  process.exit(1);
}

async function main() {
  // Verify ticket
  let res = await fetch(`${base}/api/bslatam/verify-ticket`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: `e2e-${attendeeId}`, userId: attendeeId }) });
  console.log('verify-ticket', res.status);

  // Get speaker
  res = await fetch(`${base}/api/bslatam/speakers/${speakerId}`);
  const sp = await res.json();
  const day = sp.availability?.[0]?.day;
  const time = sp.availability?.[0]?.slots?.[0];
  if (!day || !time) throw new Error('No availability');
  const start = `${day}T${time}:00-05:00`;
  const end = new Date(new Date(start).getTime() + 10*60000).toISOString();

  // Create booking
  res = await fetch(`${base}/api/bslatam/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speakerId, attendeeId, start, end }) });
  console.log('create booking', res.status);
  const created = await res.json();
  console.log('booking id', created?.data?.id);
}

main().catch((e) => { console.error(e); process.exit(1); });


