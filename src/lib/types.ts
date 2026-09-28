export type Email = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  preview: string;
  date: string;
  labelIds: string[];
  url: string;
  folder: "inbox" | "spam";
  /** Which connected Gmail account this message lives in. */
  accountId: string;
  /** Has at least one file attached (flagged during sync, or from the new-mail trigger). */
  hasAttachment?: boolean;
};

export type Attachment = { id: string; filename: string; mimeType: string };

/** One message of a conversation, loaded on demand for the reading pane. */
export type ThreadMessage = {
  id: string;
  from: string;
  to: string;
  date: string;
  text: string;
  labelIds: string[];
  attachments: Attachment[];
  /** The HTML version, when the sender wrote one. Rendered sandboxed, never trusted. */
  html?: string;
  /** Images the HTML embeds as `cid:` references, keyed by Content-ID. */
  inline?: Record<string, Attachment>;
};

export type Account = {
  /** Composio connected account id. */
  id: string;
  /** The Composio user the connection belongs to; tool calls must name it. */
  userId: string;
  email: string;
  status: "ACTIVE" | "EXPIRED" | "FAILED" | "INITIATED" | "INACTIVE" | string;
  /** The user picked this mailbox for Sift. Unpicked ones are listed but never read. */
  enabled: boolean;
  /** The GMAIL_NEW_GMAIL_MESSAGE trigger that pushes new mail here. */
  triggerId?: string;
};

export type ComposioConfig = {
  /** The API key, AES-256-GCM sealed (see lib/secrets). Never sent to the browser. */
  apiKey: string;
  /** Last four characters, so the UI can show which key is in use. */
  hint: string;
  savedAt: string;
};

/** The junk kinds Jev chooses between. `not_junk` is the no-match outcome. */
export const JUNK_KINDS = [
  "scam_or_phishing",
  "spam",
  "promotion",
  "newsletter",
  "social_notification",
  "not_junk",
] as const;
export type JunkKind = (typeof JUNK_KINDS)[number];

export const JUNK_KIND_LABELS: Record<JunkKind, string> = {
  scam_or_phishing: "Scam / phishing",
  spam: "Spam",
  promotion: "Promotions",
  newsletter: "Newsletters",
  social_notification: "Social pings",
  not_junk: "Not junk",
};

export type Analysis = {
  junkKind: JunkKind;
  junkProbabilities: Record<JunkKind, number>;
  /** 0 (ignorable) .. 3 (urgent) */
  priority: number;
  needsReply: number;
  category: string | null;
  categoryConfidence: number;
  /** Hash of the category set this `category` was computed against. */
  categoryVersion: string;
  /** The user moved this email by hand; Jev won't re-sort it. */
  manualCategory?: boolean;
  /** The user said "not junk"; never swept. */
  keep?: boolean;
};

export type Category = {
  id: string;
  name: string;
  description: string;
  color: string;
  /** Gmail label id per account, once the category is mirrored into Gmail. */
  gmailLabels?: Record<string, string>;
  createdAt: string;
};

export type Settings = {
  /** Which kinds count as junk for the one-click sweep. */
  sweepKinds: JunkKind[];
  /** Summed probability of the swept kinds needed to sweep an email. */
  threshold: number;
  /** Always sweep everything Gmail already put in Spam. */
  includeSpamFolder: boolean;
  /** Newest inbox emails fetched per account on each sync (spam gets half). */
  fetchLimit: number;
};

export type SweepRecord = {
  at: string;
  items: { id: string; accountId: string; restoreLabels: string[] }[];
};

export type Store = {
  emails: Record<string, Email>;
  analysis: Record<string, Analysis>;
  categories: Category[];
  accounts: Account[];
  composio: ComposioConfig | null;
  protectedSenders: string[];
  settings: Settings;
  lastSweep: SweepRecord | null;
  lastSyncAt: string | null;
  stats: { totalSwept: number };
  /** When the first-run walkthrough was finished; null shows it. */
  onboardedAt: string | null;
};

export type ClientState = Omit<Store, "emails" | "analysis" | "composio"> & {
  emails: (Email & { analysis?: Analysis; junkScore: number; sweepable: boolean })[];
  jevConfigured: boolean;
  composio: { configured: boolean; hint: string | null; live: boolean };
};
