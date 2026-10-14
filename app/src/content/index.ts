import site from './site.json';
import printing from './printing.json';
import fixes from './fixes.json';
import threed from './threed.json';
import assistant from './assistant.json';

export interface Fact { k: string; v: string }
export interface Step { text: string; detail: string; alt: string; rules?: boolean; ref?: boolean; fail?: boolean }
export interface Plan {
  eyebrow: string; title: string; chip: string; ctx: Ctx; url: string; say: string;
  idx?: Record<string, number>; facts: Fact[]; steps: Step[];
}
export interface Fix { label: string; title: string; cause: string; url: string; say: string; steps: string[] }
export interface Fail { id: string; label: string; fix?: string; safety?: boolean }
export type Ctx = 'print' | 'fix' | 'm1' | 'planA' | 'planB';
export type Kind = 'answer' | 'notin' | 'judge' | 'safety' | 'off';
export interface QA {
  id: string; q: string; kind: Kind; keywords: string[]; a?: string; based?: string;
  step?: string | number; to?: { screen: string; sym?: string }; rules?: boolean;
}

export type PrintPlanId = 'usb' | 'phone' | 'email' | 'make';
export type PlanId = PrintPlanId | 'A' | 'B';
export type FixId = 'lost' | 'money' | 'wrong' | 'card' | 'phone';

export const SITE = site;
export const PRINTING = printing;
export const THREED = threed;
export const FIXES = fixes;
export const ASSIST = assistant;

export const PLANS: Record<PlanId, Plan> = {
  ...(printing.plans as Record<PrintPlanId, Plan>),
  ...(threed.plans as Record<'A' | 'B', Plan>),
};
export const FIX = fixes.fixes as Record<FixId, Fix>;
export const FAILS = threed.fails as Fail[];
export const QAS = assistant.qa as Record<Ctx, QA[]>;

/** The “checked [date]” line for a screen comes from the file its content lives in. */
export function checkedFor(planOrScreen: string): string {
  if (planOrScreen === 'A' || planOrScreen === 'B' || planOrScreen === 'm0' || planOrScreen === 'm1') return threed.checkedDate;
  if (planOrScreen === 'rules') return threed.policyCheckedDate;
  if (planOrScreen === 'fix') return fixes.checkedDate;
  if (planOrScreen === 'site') return site.checkedDate;
  return printing.checkedDate;
}

/** cpl.org/tc/usb → /tc/usb (the path this build serves the phone page at). */
export const pathOf = (url: string) => url.replace(/^[^/]+/, '');

export function planBySlug(slug: string): PlanId | undefined {
  return (Object.keys(PLANS) as PlanId[]).find((k) => pathOf(PLANS[k].url) === '/tc/' + slug);
}
export function fixBySlug(slug: string): FixId | undefined {
  return (Object.keys(FIX) as FixId[]).find((k) => pathOf(FIX[k].url) === '/tc/' + slug);
}
