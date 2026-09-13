<<<<<<< HEAD
<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />



# [Project Name] 🎯


## Basic Details
### Team Name: [Name]


### Team Members
- Team Lead: [Name] - CUSAT
- Member 2: [Name] - CUSAT


### Project Description
A Chrome extension that filters out the spam that conventional emails manage to leave out

### The Problem (that doesn't exist)
Fixing the problem of not having enough applications to engage with on your Gmail for your coporate

### The Solution (that nobody asked for)
[How are you solving it? Keep it fun!]

## Technical Details
### Technologies/Components Used
For Software:
- [Languages used]
- [Frameworks used]
- [Libraries used]
- [Tools used]

For Hardware:
- [List main components]
- [List specifications]
- [List tools required]

### Implementation
For Software:
# Installation
[commands]

# Run
[commands]

### Project Documentation
For Software:

# Screenshots (Add at least 3)
![Screenshot1](Add screenshot 1 here with proper name)
*Add caption explaining what this shows*

![Screenshot2](Add screenshot 2 here with proper name)
*Add caption explaining what this shows*

![Screenshot3](Add screenshot 3 here with proper name)
*Add caption explaining what this shows*

# Diagrams
![Workflow](Add your workflow/architecture diagram here)
*Add caption explaining your workflow*

For Hardware:

# Schematic & Circuit
![Circuit](Add your circuit diagram here)
*Add caption explaining connections*

![Schematic](Add your schematic diagram here)
*Add caption explaining the schematic*

# Build Photos
![Components](Add photo of your components here)
*List out all components shown*

![Build](Add photos of build process here)
*Explain the build steps*

![Final](Add photo of final product here)
*Explain the final build*

### Project Demo
# Video
[Add your demo video link here]
*Explain what the video demonstrates*

# Additional Demos
[Add any extra demo materials/links]

## Team Contributions
- [Name 1]: [Specific contributions]
- [Name 2]: [Specific contributions]
- [Name 3]: [Specific contributions]

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)



=======
# Gmail Safe Cleanup

A Manifest V3 Chrome extension that finds Gmail messages matching user-selected keywords, uses Gemini or Grok as a second-pass safety check, and moves only user-approved messages to Gmail Trash.

## Setup

1. Create a Google Cloud project, enable the Gmail API, and create an OAuth 2.0 **Chrome Extension** client. The supplied client ID is already inserted in `manifest.json`. The OAuth consent screen should be configured and test users added while the app is in testing. The client ID must be a Chrome Extension client, not a Web application client.
2. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this folder.
3. Open the extension popup. Choose keywords, optionally add a Gemini or Grok API key/model, and click **Sign in & scan Gmail**.

The extension requests only `https://www.googleapis.com/auth/gmail.modify`, uses Gmail search to find candidates, fetches message content for classification, and calls `users.messages.trash` only after the user checks messages and confirms. It never permanently deletes messages.

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
>>>>>>> 5e7d2ab (Initial commit)
