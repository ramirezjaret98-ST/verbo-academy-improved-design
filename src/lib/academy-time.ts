export const ACADEMY_TIME_ZONE = "America/Mexico_City";
export function academyDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:ACADEMY_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
  const get=(key:string)=>parts.find(p=>p.type===key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
/** CDMX abolished DST; dates accepted by Academy's future slot picker are UTC-6. */
export function academyISO(localDateTime: string): string { return new Date(`${localDateTime}:00-06:00`).toISOString(); }
export function academyToday(): string { return academyDateTime(new Date().toISOString()).slice(0,10); }
export function academyTime(iso:string):string {return new Date(iso).toLocaleTimeString("en-US",{timeZone:ACADEMY_TIME_ZONE,hour:"2-digit",minute:"2-digit"});}
