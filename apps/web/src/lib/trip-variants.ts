/**
 * Test variations of the trip checkout (/trip/test/<slug>/): every combination of trip type, stops per journey,
 * travellers and cabin, generated from a template so each layout case can be checked. Not real fares or schedules
 * (times are simple wall-clock sums, ignoring time zones).
 */
import demo from '../content/trips/demo.json';
import type { TripAirport, TripLeg, TripOffer, TripOption, TripSegment } from './trip';

export const KINDS = [
  { id: 'oneway', label: 'One-way' },
  { id: 'round', label: 'Round trip' },
  { id: 'multi2', label: 'Multi-city (2)' },
  { id: 'multi3', label: 'Multi-city (3)' },
] as const;
export const STOPS = [
  { id: '0', label: 'Nonstop' },
  { id: '1', label: '1 layover' },
  { id: '2', label: '2 layovers' },
] as const;
export const PAX = [
  { id: '1', label: '1 adult', t: { adults: 1, children: 0, infants: 0 } },
  { id: '2', label: '2 adults', t: { adults: 2, children: 0, infants: 0 } },
  { id: 'family', label: '2 adults, 1 child, 1 infant', t: { adults: 2, children: 1, infants: 1 } },
] as const;
export const CABINS = [
  { id: 'business', label: 'Business Class' },
  { id: 'first', label: 'First Class' },
  { id: 'premium', label: 'Premium Economy' },
] as const;
export type Pick = { kind: string; stops: string; pax: string; cabin: string };
export const slugOf = (p: Pick) => `${p.kind}-${p.stops}stop-${p.pax}-${p.cabin}`;

const A = (code: string, name: string, city: string): TripAirport => ({ code, name, city });
const AP = {
  LHR: A('LHR', 'London Heathrow', 'London Heathrow'), JFK: A('JFK', 'John F. Kennedy', 'New York'),
  BOS: A('BOS', 'Boston Logan', 'Boston'), ORD: A('ORD', "Chicago O'Hare", 'Chicago'), MIA: A('MIA', 'Miami International', 'Miami'),
  DFW: A('DFW', 'Dallas/Fort Worth', 'Dallas'), LAX: A('LAX', 'Los Angeles International', 'Los Angeles'),
  SFO: A('SFO', 'San Francisco International', 'San Francisco'), CDG: A('CDG', 'Paris Charles de Gaulle', 'Paris'),
};
// journeys of each trip type: [from, to, hubs for 1 stop, hubs for 2 stops]
type J = [keyof typeof AP, keyof typeof AP, (keyof typeof AP)[], (keyof typeof AP)[]];
const JOURNEYS: Record<string, J[]> = {
  oneway: [['LHR', 'MIA', ['JFK'], ['BOS', 'ORD']]],
  round: [['LHR', 'MIA', ['JFK'], ['BOS', 'ORD']], ['MIA', 'LHR', ['JFK'], ['ORD', 'BOS']]],
  multi2: [['LHR', 'JFK', ['BOS'], ['CDG', 'BOS']], ['JFK', 'LAX', ['ORD'], ['ORD', 'DFW']]],
  multi3: [['LHR', 'JFK', ['BOS'], ['CDG', 'BOS']], ['JFK', 'MIA', ['ORD'], ['ORD', 'DFW']], ['MIA', 'LHR', ['JFK'], ['DFW', 'JFK']]],
};
const AIRCRAFT = ['Boeing 777', 'Airbus A319', 'Boeing 787', 'Airbus A380', 'Airbus A321'];

const toMin = (iso: string) => Date.parse(`${iso}:00Z`) / 60000;
const toIso = (m: number) => new Date(m * 60000).toISOString().slice(0, 16);
const hm = (m: number, pad = false) => `${pad ? String(Math.floor(m / 60)).padStart(2, '0') : Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

function leg(j: J, stops: number, startIso: string, n: number): TripLeg {
  const chain = [j[0], ...(stops === 0 ? [] : stops === 1 ? j[2] : j[3]), j[1]];
  let t = toMin(startIso);
  const start = t;
  const segments: TripSegment[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const dur = i === 0 ? 7 * 60 + 25 + n * 10 : 2 * 60 + 40 + i * 15;   // first hop long-haul, then shorter
    segments.push({
      from: AP[chain[i]], to: AP[chain[i + 1]], depart: toIso(t), arrive: toIso(t + dur), duration: hm(dur),
      airline: { name: 'British Airways', logo: 'airline-ba.png' }, flightNo: `BA${180 + n * 7 + i * 31}`, aircraft: AIRCRAFT[(n + i) % AIRCRAFT.length],
      baggage: '2 x 70lbs', baggageNote: 'Checked luggage', bags: 2, note: 'Check-in Required',
    });
    t += dur + (i === 0 ? 100 : 150);   // layovers 1h 40m, then 2h 30m
  }
  const end = toMin(segments[segments.length - 1].arrive);
  return { travelTime: hm(end - start, true), segments };
}

export function variant(p: Pick): TripOffer {
  const stops = Number(p.stops);
  const journeys = JOURNEYS[p.kind];
  const cabin = CABINS.find((c) => c.id === p.cabin)!.label;
  const base = p.cabin === 'first' ? 6890 : p.cabin === 'premium' ? 1490 : 3005;
  const options: TripOption[] = [0, 1, 2].map((k) => {
    const legs = journeys.map((j, n) => {
      const start = toMin('2026-08-27T09:00') + n * (p.kind === 'round' ? 7 : 4) * 1440 + k * 205;   // later options leave later
      return { ...leg(j, stops, toIso(start), n), label: p.kind === 'round' ? (n ? 'Return' : 'Departure') : p.kind === 'oneway' ? 'Departure' : undefined };
    });
    return {
      id: `opt-${k + 1}`, pricePerAdult: base - k * 165 - stops * 120, cabin, layovers: stops,
      travelTime: legs[0].travelTime, segments: legs[0].segments, legs,
    };
  });
  return { ...(demo as unknown as TripOffer), id: slugOf(p), travellers: { ...PAX.find((x) => x.id === p.pax)!.t }, options };
}

export const allPicks = (): Pick[] =>
  KINDS.flatMap((k) => STOPS.flatMap((s) => PAX.flatMap((x) => CABINS.map((c) => ({ kind: k.id, stops: s.id, pax: x.id, cabin: c.id })))));
