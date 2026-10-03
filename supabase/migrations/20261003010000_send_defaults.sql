-- Defaults for sending mail from Sorta. The From mailbox is one of the user's connected Gmail accounts
-- (an account id; null means "the first enabled mailbox"). CC and BCC lists are added to every send and can
-- be edited per message. The signature is appended to every send.
alter table public.user_state
  add column default_from_account text check (length(default_from_account) <= 200),
  add column default_cc text[] not null default '{}'
    check (cardinality(default_cc) <= 20 and length(array_to_string(default_cc, ',')) <= 2000),
  add column default_bcc text[] not null default '{}'
    check (cardinality(default_bcc) <= 20 and length(array_to_string(default_bcc, ',')) <= 2000),
  add column signature text not null default '' check (length(signature) <= 2000);
