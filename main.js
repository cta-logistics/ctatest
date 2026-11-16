/* CTA LOGISTICS — navigation, apparition, formulaire de cotation */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  /* ---------- Menu mobile ---------- */
  var burger = document.getElementById('burger');
  var links = document.getElementById('navLinks');
  if (burger && links) {
    var setOpen = function (open) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      links.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', function () { setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.matchMedia('(min-width:901px)').addEventListener('change', function (m) { if (m.matches) setOpen(false); });
  }

  /* ---------- Apparition au scroll ---------- */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Formulaire de cotation ---------- */
  var form = document.getElementById('quoteForm');
  if (!form) return;

  var cfg = window.CTA_CONFIG || {};
  var btn = document.getElementById('submitBtn');
  var alertBox = document.getElementById('formAlert');

  // Date d'enlèvement : pas dans le passé
  var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  var iso = today.toISOString().slice(0, 10);
  var pd = form.elements.pickupDate, dd = form.elements.deliveryDate;
  if (pd) pd.min = iso;
  if (pd && dd) pd.addEventListener('change', function () { dd.min = pd.value || iso; });

  // Présélection via ?offre=chaine-fermee | traction-cdg
  var params = new URLSearchParams(location.search);
  var offre = params.get('offre');
  if (offre) {
    var radio = form.querySelector('input[name="offre"][value="' + offre + '"]');
    if (radio) radio.checked = true;
  }

  var MESSAGES = {
    required: 'Ce champ est obligatoire.',
    email: 'Saisissez une adresse e-mail valide.',
    consent: 'Votre accord est nécessaire pour traiter votre demande.',
    date: "La date d'enlèvement ne peut pas être passée."
  };

  function setError(field, msg) {
    var wrap = field.closest('.field') || field.closest('.consent') || field.parentNode;
    var err = wrap.querySelector('.err');
    if (msg) {
      field.setAttribute('aria-invalid', 'true');
      if (err) { err.textContent = msg; err.style.display = 'block'; if (!err.id) err.id = field.id + '-err'; field.setAttribute('aria-describedby', err.id); }
    } else {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
      if (err) err.style.display = 'none';
    }
    return !msg;
  }

  function validate(field) {
    if (field.type === 'checkbox') return setError(field, field.required && !field.checked ? MESSAGES.consent : '');
    var v = (field.value || '').trim();
    if (field.required && !v) return setError(field, MESSAGES.required);
    if (field.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return setError(field, MESSAGES.email);
    if (field.name === 'pickupDate' && v && v < iso) return setError(field, MESSAGES.date);
    return setError(field, '');
  }

  var fields = Array.prototype.slice.call(form.querySelectorAll('input:not([type=radio]):not(.hp input), select, textarea'));
  fields.forEach(function (f) {
    f.addEventListener('blur', function () { validate(f); });
    f.addEventListener('input', function () { if (f.getAttribute('aria-invalid') === 'true') validate(f); });
    f.addEventListener('change', function () { if (f.getAttribute('aria-invalid') === 'true') validate(f); });
  });

  function makeRef() {
    var d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
    var rnd = ''; var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var buf = new Uint8Array(4); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(buf) : buf.forEach(function (_, i) { buf[i] = Math.random() * 255; });
    buf.forEach(function (b) { rnd += chars[b % chars.length]; });
    return 'DEV-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + rnd;
  }

  function showAlert(msg, demo) {
    alertBox.textContent = msg;
    alertBox.classList.toggle('demo', !!demo);
    alertBox.classList.add('show');
  }

  function showSuccess(ref, demo) {
    var mail = cfg.fallbackEmail || 'contact@cta-logistics.fr';
    form.closest('.form-card').innerHTML =
      '<div class="form-success" role="status">' +
      '<div class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h2>Demande bien reçue</h2>' +
      '<p class="lead" style="margin-inline:auto">Notre équipe revient vers vous avec une cotation sous 24 heures ouvrées.</p>' +
      '<span class="ref">' + ref + '</span>' +
      '<p>Conservez cette référence pour tout échange.' + (demo ? '<br><strong>Mode démonstration : aucune donnée n\'a été transmise.</strong>' : ' Un accusé de réception vous est envoyé par e-mail.') + '</p>' +
      '<p><a class="link-arrow" href="index.html">Retour à l\'accueil</a></p></div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Apps Script n'accepte pas la requête « preflight » CORS : on envoie du text/plain (requête simple).
  function post(payload) {
    return fetch(cfg.quoteEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (r) { return r.json(); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    alertBox.classList.remove('show');

    var firstBad = null;
    fields.forEach(function (f) { if (!validate(f) && !firstBad) firstBad = f; });
    if (firstBad) { firstBad.focus(); return; }

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = typeof v === 'string' ? v.trim() : v; });
    payload.consent = form.elements.consent.checked ? 'oui' : 'non';
    payload.ref = makeRef();
    payload.page = location.href.split('?')[0];

    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Envoi en cours…';
    var fail = function (msg) {
      btn.disabled = false; btn.textContent = label;
      showAlert(msg || "L'envoi a échoué. Réessayez, ou écrivez-nous à " + (cfg.fallbackEmail || 'contact@cta-logistics.fr') + '.');
    };

    if (!cfg.quoteEndpoint) {          // pas encore connecté à Google : mode démo
      setTimeout(function () { showSuccess(payload.ref, true); }, 600);
      return;
    }

    post(payload)
      .then(function (res) {
        if (res && res.ok) showSuccess(res.ref || payload.ref, false);
        else fail(res && res.error);
      })
      .catch(function () {
        // Réponse illisible (CORS/réseau) : on retente une fois « à l'aveugle ».
        // Le script ignore les doublons grâce à la référence → aucun risque de double enregistrement.
        fetch(cfg.quoteEndpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
          .then(function () { showSuccess(payload.ref, false); })
          .catch(function () { fail(); });
      });
  });
})();
