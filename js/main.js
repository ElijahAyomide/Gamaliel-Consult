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

// ===== Blog: filter + search =====
const grid = document.getElementById("post-grid");
if (grid) {
  const posts = Array.from(grid.querySelectorAll(".post"));
  const chips = Array.from(document.querySelectorAll(".chip"));
  const search = document.getElementById("post-search");
  const count = document.getElementById("post-count");
  const empty = document.getElementById("no-results");
  let filter = "all";

  const apply = () => {
    const q = (search.value || "").trim().toLowerCase();
    let shown = 0;
    posts.forEach((p) => {
      const matchCat = filter === "all" || p.dataset.cat === filter;
      const matchText = !q || p.textContent.toLowerCase().includes(q);
      p.hidden = !(matchCat && matchText);
      if (!p.hidden) shown++;
    });
    count.textContent = shown + (shown === 1 ? " article" : " articles");
    empty.hidden = shown !== 0;
  };

  chips.forEach((c) =>
    c.addEventListener("click", () => {
      filter = c.dataset.filter;
      chips.forEach((x) => x.classList.toggle("active", x === c));
      apply();
    })
  );
  search.addEventListener("input", apply);
}

// ===== Forms (contact + newsletter) =====
// Each form has data-endpoint. Replace the YOUR_..._FORM_ID part with your Formspree form ID (see README).
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
    if (form.querySelector(".hp").value) return; // spam trap

    const endpoint = form.dataset.endpoint;
    if (!endpoint || endpoint.includes("YOUR_")) {
      say("This form is not connected yet. Add your Formspree form ID (see README) to start receiving messages.", false);
      return;
    }

    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Request failed");
      form.reset();
      say("Thank you. Your message has been sent and we will be in touch soon.", true);
    } catch (err) {
      say("Sorry, something went wrong. Please try again or email hello@gamalielconsult.com.", false);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
});
