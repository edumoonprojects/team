# EduMoon Team Portal

Members-only portal for the EduMoon team and Student Leads: tasks, daily check-ins, approvals and a worked/missed calendar.

Phase 1: login, people and roles, My page, check-in, approvals, team view, admin.
Coming next: event logs with points, leaderboard, recruitment tracker, home feed and ideas board, Export for Chapters.

## One-time setup (about 15 minutes)

### 1. Create the database
1. Go to supabase.com and create a **new project** (for example `edumoon-team`). Keep it separate from the app's project.
2. Open **SQL Editor**, click **New query**, paste everything from `setup/setup.sql`, and click **Run**. Run it only once.
3. Open **Project Settings > API**. Copy the **Project URL** and the **anon public** key.

### 2. Connect the website
1. Open `assets/config.js` and paste the URL and key between the quotes.
2. The anon key is safe to be public. The database rules decide who can see what.

### 3. Put it online (GitHub Pages)
1. Under `edumoonprojects`, create a new public repo called `team`.
2. Upload the contents of the update zip: `index.html` and the `assets` folder. Do not upload the `setup` folder.
3. Settings > Pages > Source: main branch, root. The site goes live at `https://edumoonprojects.github.io/team/`.

### 4. Create your own login first
1. Supabase > **Authentication > Users > Add user > Create new user**.
2. Email: `vikas@theedumoon.com`, choose a password, tick **Auto Confirm User**.
3. Open the site and sign in. You land on Approvals.

### 5. Add everyone else
1. In the portal, open **Admin** and use **Edit** to add each person's email. Everyone from the Chapters site is already in the list.
2. For each person, create a login in Supabase the same way as step 4, with their email and a password.
3. Send them the link and their password on WhatsApp. They can change it from My page.

## Who sees what

| Person | Sees |
|---|---|
| Vikas | Everyone, including Aparna's page. Approves everything. |
| Aparna (admin) | Everyone except Vikas's private page. Approves everything. Her own page is seen only by Vikas. |
| Paid team (Sruthi, Hardik, Spandana) | Each other's tasks, and can assign to each other |
| Student Lead Head (Srivalli) | All Student Leads, and approves their work |
| Student Leads | Only their own page |
| Vikas's page | Private, only Vikas |

Check-in reasons (exams, family, not well) are seen only by the person, admins, and Srivalli for Student Leads.

## How days are counted
- **Worked:** a check-in or task that was approved that day
- **Waiting:** submitted but not approved yet
- **Excused:** exams, family, not well, no task given, or a team off day
- **Missed:** nothing logged

## Updating
Send the update zip's files to GitHub the same way. The `?v=` numbers in `index.html` make phones load the new version.

Built with HTML, CSS and JavaScript. Data in Supabase. Hosted free on GitHub Pages.
