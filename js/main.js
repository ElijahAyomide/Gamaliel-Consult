// ===== Gamaliel Consult: site scripts =====

// Mobile menu
const toggle = document.querySelector(".menu-toggle");
const mobileMenu = document.getElementById("mobile-menu");
if (toggle && mobileMenu) {
  toggle.addEventListener("click", () => {
    const open = mobileMenu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
}

// Footer year
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

// Attorneys carousel
const track = document.querySelector(".carousel-track");
if (track) {
  const cards = Array.from(track.children);
  const dotsWrap = document.querySelector(".dots");
  const prev = document.querySelector(".arrow-prev");
  const next = document.querySelector(".arrow-next");

  const step = () => {
    const gap = parseFloat(getComputedStyle(track).columnGap) || 24;
    return cards[0].getBoundingClientRect().width + gap;
  };

  const dots = cards.map((card, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", "Show attorney " + (i + 1));
    b.addEventListener("click", () => track.scrollTo({ left: i * step(), behavior: "smooth" }));
    dotsWrap.appendChild(b);
    return b;
  });

  const update = () => {
    const i = Math.min(cards.length - 1, Math.round(track.scrollLeft / step()));
    dots.forEach((d, n) => d.classList.toggle("active", n === i));
  };

  prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
  track.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

// ===== Blog: filter, search and pagination =====
const grid = document.getElementById("post-grid");
if (grid) {
  const PAGE_SIZE = 6;
  const posts = Array.from(grid.querySelectorAll(".post"));
  const chips = Array.from(document.querySelectorAll(".chip"));
  const search = document.getElementById("post-search");
  const count = document.getElementById("post-count");
  const empty = document.getElementById("no-results");
  const pager = document.getElementById("pagination");
  let filter = "all";
  let page = 1;

  const render = (scroll) => {
    const q = (search.value || "").trim().toLowerCase();
    const matches = posts.filter((p) => {
      const okCat = filter === "all" || p.dataset.cat === filter;
      const okText = !q || p.textContent.toLowerCase().includes(q);
      return okCat && okText;
    });
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    if (page > pages) page = pages;
    posts.forEach((p) => (p.hidden = true));
    matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach((p) => (p.hidden = false));
    count.textContent = matches.length + (matches.length === 1 ? " article" : " articles");
    empty.hidden = matches.length !== 0;

    pager.innerHTML = "";
    pager.hidden = pages <= 1;
    if (pages > 1) {
      for (let n = 1; n <= pages; n++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "page" + (n === page ? " current" : "");
        b.textContent = n;
        b.setAttribute("aria-label", "Page " + n);
        if (n === page) b.setAttribute("aria-current", "page");
        b.addEventListener("click", () => { page = n; render(true); });
        pager.appendChild(b);
      }
      if (page < pages) {
        const next = document.createElement("button");
        next.type = "button";
        next.className = "page";
        next.textContent = "→";
        next.setAttribute("aria-label", "Next page");
        next.addEventListener("click", () => { page++; render(true); });
        pager.appendChild(next);
      }
    }
    if (scroll) document.querySelector(".list-head").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  chips.forEach((c) =>
    c.addEventListener("click", () => {
      filter = c.dataset.filter;
      page = 1;
      chips.forEach((x) => x.classList.toggle("active", x === c));
      render(false);
    })
  );
  search.addEventListener("input", () => { page = 1; render(false); });
  render(false);
}

// ===== Forms (contact + newsletter) =====
// These forms are handled by Netlify Forms. Messages appear in the Netlify dashboard
// and are emailed to the address set under Project configuration > Notifications.
document.querySelectorAll("form[data-form]").forEach((form) => {
  const status = form.querySelector(".form-status");
  const button = form.querySelector('button[type="submit"]');
  const say = (msg, ok) => {
    status.textContent = msg;
    status.className = "form-status " + (ok ? "ok" : "err");
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const trap = form.querySelector('[name="bot-field"]');
    if (trap && trap.value) return; // spam trap

    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const res = await fetch(form.getAttribute("action") || "/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) throw new Error("Request failed");
      form.reset();
      say(form.dataset.success || "Thank you. Your message has been sent.", true);
    } catch (err) {
      say("Sorry, something went wrong. Please try again, or contact us using the details on this page.", false);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
});
