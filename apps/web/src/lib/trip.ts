/**
 * Trip offer: what an agent prepares for one customer and sends as a private link (the "Review details and confirm
 * your trip" flow, Figma "Addition 1-5"). Phase 1 reads demo files from src/content/trips/*.json; later the same shape
 * comes from the CMS or the client's booking system, so this file is the data contract.
 *
 * Money is in whole currency units with cents (e.g. 3005 or 210.55); `currency` is an ISO code (USD).
 */
export interface TripAirport { code: string; name: string; city: string }
export interface TripSegment {
  from: TripAirport;
  to: TripAirport;
  depart: string;            // local date-time at `from`, ISO without zone: "2026-08-27T11:00"
  arrive: string;            // local date-time at `to`
  duration: string;          // "7h 55m"
  airline: { name: string; logo?: string };   // logo: file in src/assets/trip/
  flightNo: string;
  aircraft: string;          // "777"
  baggage: string;           // "2 x 70lbs"
  baggageNote?: string;      // "Checked luggage" (second line on phones)
  bags: number;              // checked bags per passenger (summary: "2 x [bag]")
  note?: string;             // "Check-in Required"
}
export interface TripOption {
  id: string;
  pricePerAdult: number;
  cabin: string;             // "Business Class"
  layovers: number;
  travelTime: string;        // "07h 55m" (outbound)
  segments: TripSegment[];   // outbound flights in order; a layover is shown between consecutive ones
  returnTravelTime?: string;
  returnSegments?: TripSegment[];   // round trips: the way back
}
export interface ProtectionPlan { id: string; name: string; price: number; popular?: boolean }
export interface ProtectionFeature {
  label: string;
  /** per plan id: true = included, false = not, string = a value (e.g. "$50") */
  plans: Record<string, boolean | string>;
}
export interface TripOffer {
  id: string;
  currency: string;
  agent: { name: string; phone: string; email?: string; photo?: string };
  travellers: { adults: number; children: number; infants: number };
  options: TripOption[];
  protection: { plans: ProtectionPlan[]; features: ProtectionFeature[] };
  tipPercents: number[];
}

const files = import.meta.glob('../content/trips/*.json', { eager: true, import: 'default' }) as Record<string, TripOffer>;
export const getTrips = (): TripOffer[] => Object.values(files);

export const money = (n: number, currency = 'USD', cents = true) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n);

const d = (iso: string) => new Date(`${iso}:00Z`);   // local wall time, formatted in UTC so it never shifts
export const fmtTime = (iso: string) => d(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
/** Time on the ground between two flights at the same airport (both local times there): "1h 40m". */
export const layover = (arrive: string, depart: string) => {
  const m = Math.round((d(depart).getTime() - d(arrive).getTime()) / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
export const fmtDay = (iso: string) => d(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
