# Gamaliel Consult website (editable version)

The website text, images and blog posts now live in the `content/` folder and are edited through the
admin screen at **your-site-address/admin**. A small script (`build.js`) turns that content into the
finished pages every time you publish. Netlify runs it for you, so there is nothing to install.

## One-time setup (do these in order)

### 1. Replace the old files in your project
In your project folder, delete the old page files (`index.html`, `about.html`, `practice-areas.html`,
`blog.html`, `contact.html`, `privacy.html`, `legal.html` and every `post-*.html`), then copy everything
from this zip into the folder (keep `css`, `js`, `images`, `content`, `admin`, `build.js`, `netlify.toml`,
`package.json`). Then in the VS Code terminal:

    git add -A
    git commit -m "Editable site with admin"
    git push

### 2. Change two Netlify settings
Netlify > your site > **Project configuration > Build & deploy > Build settings** (the file `netlify.toml`
already contains these, but check them):
- Build command: `node build.js`
- Publish directory: `dist`

Then open **Deploys** and watch the new deploy finish. If it fails, send the log text.

### 3. Make contact-form messages arrive in your email
1. After the deploy above, open Netlify > **Forms**. You should see two forms: `contact` and `newsletter`.
2. Go to **Project configuration > Notifications > Emails and webhooks > Add notification > Email notification**.
3. Event to listen for: **New form submission**. Choose the form `contact`. Enter the email address that
   should receive enquiries. Save.
4. Repeat for `newsletter` (use the same or another address).
5. Test it: send a message from the live Contact page. It should appear under Forms and in your inbox.

The email address you type in step 3 is where messages are delivered. It is separate from the email address
shown on the website, which you change in the admin.

### 4. Turn on the admin login (Decap Turbo)
The admin signs in with an email and password (no GitHub account needed for the editor).
1. Go to https://turbo.decapcms.org/signup and create an account (the Free plan needs no card).
2. Connect GitHub when asked (install the **Decap Turbo GitHub App** on your website repository).
3. Create a site in Turbo: pick the repository, branch `main`, and set the admin URL to
   `https://YOUR-SITE.netlify.app/admin/` (use your real address). Copy the **Site ID**.
4. Open `admin/config.yml` and replace `YOUR_TURBO_SITE_ID` with that Site ID. Save, then commit and push
   (`git add -A`, `git commit -m "Add Turbo site ID"`, `git push`).
5. In the Turbo dashboard, invite the person who will manage the website by email. They choose a password
   and then sign in at `https://YOUR-SITE.netlify.app/admin/`.

Check Turbo's pricing page for the current limits. At launch the Free plan covered 1 site and 1 seat, and a
paid plan covered more people.

## What the admin can edit
- **Blog posts:** add, edit, delete or hide (Draft) posts, with cover image, category, date and article text.
  Tick "Featured post" to show a post in the large panel at the top of the Blog page.
- **Contact details & site settings:** email, phone, WhatsApp number, LinkedIn link, address, footer text,
  and the "Let's talk" band that appears on several pages. The LinkedIn link stays hidden until you fill it in.
- **Pages:** all text and images on Home, About Us, Practice Areas, Contact Us, Blog, Privacy and Legal.
- **Attorneys:** names, roles, photos and descriptions (used on the Home and About pages).

Notes:
- After clicking **Publish**, the live site updates in about a minute.
- Text fields that say "Press Enter" can hold a line break, which shows as a new line on large screens.
- In long texts you can type `{{email}}` to insert the email address from the contact settings.
- Text in [square brackets] on the Privacy and Legal pages is highlighted gold as a reminder to fill something in.
- Uploaded photos are saved in `images/uploads`. Landscape photos at least 1200 px wide look best.

## Folder guide
- `content/` the text and posts (edited by the admin)
- `admin/` the admin screen and its settings (`config.yml`)
- `css/`, `js/`, `images/` the design, behaviour and pictures
- `build.js` builds the website into `dist/` (created automatically, not saved to GitHub)
- `netlify.toml` tells Netlify how to build

Optional: to preview on your own computer, install Node.js, run `node build.js` and open `dist/index.html`.
