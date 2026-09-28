/** Made-up mail for the landing page demos. Nothing here is read from a real inbox. */

export type DemoCategory = { name: string; hue: number };

export const CATEGORIES: DemoCategory[] = [
  { name: "Job hunt", hue: 250 },
  { name: "Money", hue: 155 },
  { name: "Travel", hue: 70 },
  { name: "Family", hue: 330 },
];

export const catColor = (hue: number) => `oklch(0.72 0.14 ${hue})`;

export type DemoRow = {
  id: number;
  from: string;
  subject: string;
  preview: string;
  time: string;
  unread?: boolean;
  needsYou?: boolean;
  /** A category name, or a junk kind label when `junk` is set. */
  label: string;
  junk?: boolean;
};

export const INBOX: DemoRow[] = [
  { id: 1, from: "Priya Shah", subject: "Interview loop for Thursday", preview: "Can you do 2pm with the platform team?", time: "9:41", unread: true, needsYou: true, label: "Job hunt" },
  { id: 2, from: "PayPaI Support", subject: "Verify your acc0unt within 24h", preview: "Unusual sign-in detected, confirm your details", time: "9:12", unread: true, label: "Scam / phishing", junk: true },
  { id: 3, from: "HDFC Bank", subject: "Your statement for September", preview: "Statement for account ending 4417 is ready", time: "8:55", label: "Money" },
  { id: 4, from: "Uber Eats", subject: "40% off your next 3 orders", preview: "Only this weekend. Tap to claim", time: "8:30", label: "Promotions", junk: true },
  { id: 5, from: "Mom", subject: "Diwali plans?", preview: "Are you coming home on the 18th or the 19th?", time: "Sat", unread: true, needsYou: true, label: "Family" },
  { id: 6, from: "LinkedIn", subject: "You appeared in 9 searches", preview: "See who's looking at your profile", time: "Sat", label: "Social pings", junk: true },
  { id: 7, from: "IndiGo", subject: "Boarding pass: BLR → GOI", preview: "6E 512 departs 07:15 from Terminal 1", time: "Fri", label: "Travel" },
  { id: 8, from: "The Weekly Digest", subject: "Issue #212: the best of the week", preview: "Twelve links we couldn't stop reading", time: "Fri", label: "Newsletters", junk: true },
  { id: 9, from: "Zerodha", subject: "Contract note for 26 Sep", preview: "Your equity contract note is attached", time: "Thu", label: "Money" },
];

export type CategoryExample = {
  name: string;
  hue: number;
  description: string;
  matches: { from: string; subject: string; p: number }[];
};

export const CATEGORY_EXAMPLES: CategoryExample[] = [
  {
    name: "Money",
    hue: 155,
    description: "bank statements, UPI receipts, taxes",
    matches: [
      { from: "HDFC Bank", subject: "Your statement for September", p: 0.98 },
      { from: "Google Pay", subject: "You paid ₹640 to Third Wave Coffee", p: 0.96 },
      { from: "Payroll", subject: "Form 16 for FY 2025-26", p: 0.93 },
      { from: "Zerodha", subject: "Contract note for 26 Sep", p: 0.88 },
    ],
  },
  {
    name: "Job hunt",
    hue: 250,
    description: "recruiters, interview loops, offer letters",
    matches: [
      { from: "Priya Shah", subject: "Interview loop for Thursday", p: 0.97 },
      { from: "Greenhouse", subject: "Your application to Stripe", p: 0.95 },
      { from: "Arjun (Razorpay)", subject: "Quick chat about a staff role?", p: 0.91 },
      { from: "Wellfound", subject: "3 companies viewed your profile", p: 0.74 },
    ],
  },
  {
    name: "Travel",
    hue: 70,
    description: "flights, hotels, visas, anything about a trip",
    matches: [
      { from: "IndiGo", subject: "Boarding pass: BLR → GOI", p: 0.99 },
      { from: "Airbnb", subject: "Check-in details for your Goa stay", p: 0.97 },
      { from: "VFS Global", subject: "Visa appointment confirmed", p: 0.94 },
      { from: "Rohan", subject: "Re: splitting the villa for December", p: 0.81 },
    ],
  },
];

/** Tiny seeded PRNG so the sweep demo's numbers are stable between server and client. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export type SweepKind = { key: string; label: string; hint: string; on: boolean; probs: number[] };

/** How sure Jev is about each email of each kind. The threshold slider counts the ones above it. */
export const SWEEP_KINDS: SweepKind[] = [
  { key: "scam", label: "Scam / phishing", hint: "Fake invoices, lookalike senders", on: true, n: 14, lo: 0.6 },
  { key: "spam", label: "Spam", hint: "Bulk mail you never asked for", on: true, n: 63, lo: 0.5 },
  { key: "promo", label: "Promotions", hint: "Sales, coupons, discount codes", on: true, n: 181, lo: 0.45 },
  { key: "news", label: "Newsletters", hint: "Digests and mailing lists", on: false, n: 96, lo: 0.5 },
  { key: "social", label: "Social pings", hint: "Likes, follows, 'you appeared in…'", on: false, n: 72, lo: 0.55 },
].map(({ n, lo, ...k }, i) => {
  const rand = seeded(i + 7);
  return { ...k, probs: Array.from({ length: n }, () => lo + (1 - lo) * Math.sqrt(rand())) };
});
