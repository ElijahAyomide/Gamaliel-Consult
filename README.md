# Gamaliel Consult website (plain HTML, CSS, JS)

No install needed. Open `index.html` in your browser (double-click it), or in VS Code
install the "Live Server" extension, right-click `index.html` and choose "Open with Live Server".

## Folder
- `index.html`: the homepage. Each section is labelled with a comment.
- `css/styles.css`: all styling. Colors and fonts are at the top under `:root`.
- `js/main.js`: mobile menu and attorneys carousel.
- `images/`: logo and placeholder images.

## Replacing the placeholder images
The placeholders are the photos from your design (hero, founder, three attorneys, three blog images, plus `boardroom.jpg` on the About page). Attorney 4 reuses a crop of the founder photo. To swap one:
1. Put your photo in `images/` (e.g. `my-hero.jpg`).
2. In `index.html`, change the matching `src="images/hero.svg"` to `src="images/hero.jpg"`.
Tip: keep photos under about 300 KB each so the site loads fast.

## Editing text
Edit the text between the tags in `index.html`. To add an attorney, copy one `<li class="team-card">` block.

## Pages
- `index.html` Home
- `about.html` About Us
- `practice-areas.html` Practice Areas
- `blog.html` Blog (topic filters and search work)
- `contact.html` Contact Us
- `post-*.html` One page per blog post (7 posts)
- `privacy.html` Privacy policy
- `legal.html` Legal notice

## Making the forms send email (Contact + Newsletter)
A plain HTML site cannot send email by itself, so the forms use Formspree (free for low volume):
1. Create an account at https://formspree.io and click "New form". Use the firm's email as the destination.
2. Copy the form ID (the part after `/f/` in the form's URL, for example `xyzabcde`).
3. In `contact.html`, find `data-endpoint="https://formspree.io/f/YOUR_CONTACT_FORM_ID"` and replace `YOUR_CONTACT_FORM_ID` with your ID.
4. In `blog.html`, do the same for `YOUR_NEWSLETTER_FORM_ID` (create a second form in Formspree for newsletter sign-ups).
Until you do this, the forms show "This form is not connected yet" instead of sending.

## Blog posts
The blog list lives in `blog.html` (copy one `<article class="post">` block to add a post). Each post has its own page (`post-before-you-sign.html`, `post-mediation.html` and so on). The post text is sample content written to fill the design, so replace it with the firm's own articles. To add a post: copy any `post-*.html`, rename it, edit the title, date, image and text, add a card for it in `blog.html` that links to the new file, and update the "More from the journal" cards if you wish. The page numbers 1, 2, 3 are decorative until there are enough posts.

## Legal pages
`privacy.html` and `legal.html` are drafts. Highlighted gold text marks details you must fill in (address, regulator, jurisdiction, retention period). Have the firm's lawyers review both before the site goes live.

## Publishing (GitHub + hosting)
1. Open this folder in VS Code (the folder that contains `index.html`).
2. Source Control tab > Initialize Repository > write a message ("Initial site") > Commit > Publish Branch (sign in to GitHub when asked).
3. Netlify: app.netlify.com > Add new site > Import from GitHub > choose the repo > leave build command empty, publish directory `.` > Deploy.
   Vercel: vercel.com > Add New > Project > import the repo > Framework Preset "Other", leave build settings empty > Deploy.
4. After that, every time you commit and push to GitHub, the live site updates by itself.
