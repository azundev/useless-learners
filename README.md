# Gmail Safe Cleanup

A Manifest V3 Chrome extension that finds Gmail messages matching user-selected keywords, uses Gemini or Grok as a second-pass safety check, and moves only user-approved messages to Gmail Trash.

## Setup

1. Create a Google Cloud project, enable the Gmail API, and create an OAuth 2.0 **Chrome Extension** client. Put that ID in `manifest.json` under `oauth2.client_id`. Do not use the Web client ID configured for Supabase; Google rejects it with `Custom scheme URIs are not allowed for 'WEB' client type`. The OAuth consent screen should be configured and test users added while the app is in testing.
2. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this folder.
3. Open the extension popup. Choose keywords, optionally add a Gemini or Grok API key/model, and click **Sign in & scan Gmail**.

The extension requests only `https://www.googleapis.com/auth/gmail.modify`, uses Gmail search to find candidates, fetches message content for classification, and calls `users.messages.trash` only after the user checks messages and confirms. It never permanently deletes messages.

### Authentication variables

- `manifest.json → oauth2.client_id`: Google OAuth **Chrome Extension** client ID used by `chrome.identity.getAuthToken()` for Gmail.
- `popup.js → SUPABASE_URL`: Supabase project URL used for settings sync.
- `popup.js → settings.supabaseKey`: Supabase publishable/anon key entered in the popup.

The Supabase callback `https://tecarasdwggresobjoas.supabase.co/auth/v1/callback` is for a Google OAuth provider configured inside Supabase. It is not the callback or client type used by this extension's direct Gmail OAuth flow. A client ID created for that callback is normally a **Web application** client and cannot be placed in `manifest.json → oauth2.client_id`.

## AI configuration

Gemini is the default provider. The default model is `gemini-3.8-flash`; the model field is editable because model availability can vary by account and API release. Grok uses xAI's OpenAI-compatible `/v1/chat/completions` endpoint; enter a model name available to the user's xAI account.

For a public release, do not ship a shared AI key inside the extension. Put AI calls behind an authenticated server-side proxy or make users provide their own key, as this scaffold does.

## Supabase sync

The popup includes Supabase email/password sign-in and syncs keyword settings. Before using sync, open the Supabase SQL Editor and run the complete migration in [`supabase/migrations/001_user_settings.sql`](supabase/migrations/001_user_settings.sql). It creates the table, row-level security policies, and grants required by the extension. If the popup reports `Could not find the table 'public.user_settings' in the schema cache`, the migration has not been run in the Supabase project configured in `popup.js`.

The migration is:

```sql
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  keywords text[] not null default array['ads','advertisement','spam','scam','promotion','promotional','unsubscribe'],
  ai_provider text not null default 'gemini',
  ai_model text,
  max_results integer not null default 50,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "Users can read their own settings" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own settings" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own settings" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

### If the same schema-cache error remains

1. Open the Supabase dashboard for the project whose URL is `https://tecarasdwggresobjoas.supabase.co`.
2. In SQL Editor, run the entire `supabase/migrations/001_user_settings.sql` file, including the final `notify pgrst, 'reload schema';` line.
3. Verify the result with:

```sql
select to_regclass('public.user_settings');
```

It must return `public.user_settings`. If it returns `null`, the SQL was run in a different project or did not complete. If it returns the table name, wait a few seconds, reload the unpacked extension from `chrome://extensions`, and sign in again.

In the extension popup, enter your Supabase email, password, and the browser-safe publishable/anon key from Project Settings → API. Do not enter the service-role/secret key. The project URL is already configured for `tecarasdwggresobjoas.supabase.co`.

## Safety notes

Keyword matching is only candidate discovery. The AI prompt explicitly treats terms such as `sponsor`, `promotion`, and `unsubscribe` as ambiguous and flags possible invoices, account notices, business requests, sponsorship inquiries, receipts, and personal mail for review. AI failure falls back to manual review; it never authorizes deletion.
