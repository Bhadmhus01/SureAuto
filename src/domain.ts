export type CheckKind = 'customs' | 'theft' | 'ownership' | 'accident' | 'condition' | 'inspection'
export const CHECKS: { key: CheckKind; label: string; days: number; description: string }[] = [
  { key: 'customs', label: 'Customs duty', days: 365, description: 'Clearance documents and assessment review' },
  { key: 'theft', label: 'Theft status', days: 30, description: 'Available stolen-vehicle record review' },
  { key: 'ownership', label: 'Ownership', days: 90, description: 'Seller authority and document consistency' },
  { key: 'accident', label: 'Accident history', days: 730, description: 'Available foreign title and auction records' },
  { key: 'condition', label: 'Vehicle condition', days: 90, description: 'Mechanical, chassis and paint-depth audit' },
  { key: 'inspection', label: 'Diagnostic inspection', days: 90, description: 'OBD-II codes and safety-system observations' },
]
export const DEMO_DATE = new Date('2026-10-08T12:00:00Z')
export function validVin(vin: string) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase()) }
export function freshness(date: string | undefined, days: number, now = DEMO_DATE) {
  if (!date) return { fresh: false, age: 0, overdue: 0, missing: true }
  const age = Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 86400000))
  return { fresh: Number.isFinite(age) && age < days, age, overdue: Math.max(0, age - days), missing: false }
}
export const money = (value: number) => '₦' + value.toLocaleString('en-NG')
export type Vehicle = { id: string; vin: string; name: string; year: number; price: number; mileage: number; location: string; image: string; fuel: string; transmission: string; origin: string; dates: Partial<Record<CheckKind, string>>; previousMileage: number; featured?: boolean }
const freshDates = { customs: '2026-07-03', theft: '2026-09-30', ownership: '2026-09-14', accident: '2026-07-03', condition: '2026-09-14', inspection: '2026-09-14' }
export const VEHICLES: Vehicle[] = [
  { id: 'lexus', vin: '2T2BZMCA0JC123456', name: 'Lexus RX 350', year: 2018, price: 38500000, mileage: 68200, previousMileage: 65000, location: 'Lekki, Lagos', image: '/images/lexus.jpg', fuel: 'Petrol', transmission: 'Automatic', origin: 'Foreign used', dates: freshDates, featured: true },
  { id: 'toyota', vin: '4T1B11HK0LU123456', name: 'Toyota Camry SE', year: 2020, price: 27900000, mileage: 42300, previousMileage: 41000, location: 'Ikeja, Lagos', image: '/images/toyota.jpg', fuel: 'Petrol', transmission: 'Automatic', origin: 'Foreign used', dates: freshDates },
  { id: 'mercedes', vin: 'WDDWF4JB0HR123456', name: 'Mercedes-Benz C300', year: 2017, price: 29800000, mileage: 81500, previousMileage: 79000, location: 'Wuse, Abuja', image: '/images/mercedes.jpg', fuel: 'Petrol', transmission: 'Automatic', origin: 'Nigerian used', dates: { ...freshDates, theft: '2026-08-21' } },
]
export function quote(dates: Vehicle['dates']) { return CHECKS.filter(c => !freshness(dates[c.key], c.days).fresh).length * 2500 }
export function rollback(previous: number, current: number) { return Math.max(0, previous - current) }
export function load<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback } }
export function persist(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false } }
