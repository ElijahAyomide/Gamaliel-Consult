# Gamaliel Consult website (with its own admin login)

All the website text, photos and blog posts live in the `content/` folder. The admin screen at
**your-site-address/admin** lets one person sign in with an email and password and edit them.
When the admin clicks Save, the change is saved to GitHub and Netlify rebuilds the website
(about a minute). No other service or account is needed.

## One-time setup (in order)

### 1. Replace the old files and push
In your project folder delete the old page files (`index.html`, `about.html`, `practice-areas.html`,
`blog.html`, `contact.html`, `privacy.html`, `legal.html`, every `post-*.html`) and the old `css`, `js`,
`images` and `admin` folders. Copy everything from this zip into the folder, then run:

    git add -A
    git commit -m "Editable site with admin login"
    git push

### 2. Netlify build settings
Nothing to type: `netlify.toml` already tells Netlify to run `node build.js` and publish `dist`,
and to run the admin function. After the deploy, check that it says "Published".

### 3. Contact-form messages to your email
1. Netlify > **Forms**: you should see `contact` and `newsletter`.
2. **Project configuration > Notifications > Emails and webhooks > Add notification > Email notification**.
3. Event: **New form submission**. Form: **contact**. Enter the address that should receive enquiries. Save.
4. Repeat for `newsletter`. Then send a test message from the live Contact page.

### 4. Turn on the admin login

**a. Create a GitHub key for the admin (a "fine-grained token")**
1. GitHub > your profile picture > **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
2. Name: `Website admin`. Expiration: choose a date (for example one year) and put a reminder in your calendar.
3. **Repository access: Only select repositories** > pick your website repository.
4. **Permissions > Repository permissions > Contents: Read and write**.
5. Generate the token and copy it now (GitHub shows it only once).

**b. Add the settings in Netlify**
Netlify > your site > **Site configuration > Environment variables > Add a variable**. Add these six:

| Name | Value |
|---|---|
| `ADMIN_EMAIL` | the email the admin will sign in with |
| `ADMIN_PASSWORD` | a long password or passphrase (14+ characters) |
| `SESSION_SECRET` | any random text, 40+ characters (keep it secret) |
| `GITHUB_TOKEN` | the token you copied |
| `GITHUB_REPO` | `your-github-username/your-repository-name` |
| `GITHUB_BRANCH` | `main` |

**c. Redeploy once** so the admin picks up the settings: Netlify > **Deploys > Trigger deploy > Deploy site**.

**d. Sign in** at `https://YOUR-SITE.netlify.app/admin/` with the email and password from step b.

Notes:
- To change the admin password, change `ADMIN_PASSWORD` in Netlify and redeploy.
- To sign everyone out at once, change `SESSION_SECRET` and redeploy. Sessions also expire after 12 hours.
- Keep `GITHUB_TOKEN` private. It only exists in Netlify, never in the website or the code.
- Too many wrong passwords from one place are blocked for 15 minutes.

## What the admin can do
- **Blog posts:** write, edit, hide (draft) or delete posts, with a cover photo, category and a preview.
  The newest post marked "Featured" appears in the large panel on the Blog page.
- **Contact details & footer:** email, phone, WhatsApp number, LinkedIn link, address, footer text and the
  "Let's talk" band. The LinkedIn link stays hidden until an address is filled in. The tap-to-call link
  follows the phone number automatically.
- **Pages:** the text and photos of Home, About Us, Practice Areas, Contact Us, Blog, Privacy and Legal.
- **Attorneys:** names, roles, photos and descriptions.

Good to know:
- After **Save**, the live site updates in about a minute. If two people save at once, the second gets a
  message asking them to reload.
- Photos are shrunk in the browser before upload (JPG, PNG or WebP). Landscape photos work best.
- In long texts you can type `{{email}}` to insert the email address from the contact settings.
- Text in [square brackets] on the Privacy and Legal pages shows in gold as a reminder to fill in a detail.
- The admin can only change the website's content. It cannot change the design or other files.

## Folder guide
- `content/` the text and posts (edited through the admin)
- `admin/` the admin screen
- `netlify/functions/admin.js` the private function that checks the password and saves to GitHub
- `build.js` and `lib/` build the pages (the result goes to `dist/`, created automatically)
- `css/`, `js/`, `images/` design, behaviour and pictures (admin uploads go to `images/uploads`)
- `netlify.toml` Netlify settings
