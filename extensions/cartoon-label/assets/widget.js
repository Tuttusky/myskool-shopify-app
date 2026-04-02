/**
 * Myskool personalised label widget — vanilla JS (storefront Theme App Extension)
 * Default API host must return JSON (Remix /api/upload-photo). Shop /apps/... URLs return HTML if App Proxy is not active.
 */
var DEFAULT_DIRECT_UPLOAD_API =
  "https://myskool-shopify-app-production.up.railway.app/api/upload-photo";

const MySkoolWidget = {
  state: {
    screen: "tips",
    photoFile: null,
    photoUrl: null,
    uploadedCdnUrl: null,
    name: "",
    school: "",
    std: "",
    rollNo: "",
    theme: "animal",
    apiUrl: "",
    variantId: null,
    productId: null,
  },

  themes: [
    { id: "animal", label: "Animal" },
    { id: "dino", label: "Dino" },
    { id: "jungle", label: "Jungle" },
    { id: "kinder", label: "Kinder" },
    { id: "mermaid", label: "Mermaid" },
    { id: "sea", label: "Sea" },
  ],

  themeEmoji: {
    animal: "\uD83D\uDC3C",
    dino: "\uD83E\uDD96",
    jungle: "\uD83C\uDF3F",
    kinder: "\uD83C\uDFA8",
    mermaid: "\uD83E\uDDDC",
    sea: "\uD83D\uDC19",
  },

  _els: {
    root: null,
    overlay: null,
    headerTitle: null,
    screens: null,
    tipsWrap: null,
    detailsWrap: null,
    previewWrap: null,
    backBtn: null,
    fileInput: null,
    modalLastFocus: null,
    trapHandler: null,
  },

  init() {
    var root = document.getElementById("myskool-widget-root");
    if (!root) return;
    this._els.root = root;
    var rawUrl = root.getAttribute("data-api-url");
    this.state.apiUrl =
      (rawUrl && String(rawUrl).trim()) || DEFAULT_DIRECT_UPLOAD_API;
    var btnLabel = root.getAttribute("data-button-label") || "Personalise This";
    this.state.productId = root.getAttribute("data-product-id");
    var vid = root.getAttribute("data-variant-id");
    this.state.variantId = vid ? parseInt(vid, 10) : null;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msk-btn";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.appendChild(document.createTextNode(btnLabel));
    btn.addEventListener("click", this.openModal.bind(this));
    root.appendChild(btn);
  },

  openModal() {
    if (this._els.overlay) return;

    var self = this;
    this._els.modalLastFocus = document.activeElement;

    var overlay = document.createElement("div");
    overlay.className = "msk-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "msk-modal-title");

    var modal = document.createElement("div");
    modal.className = "msk-modal";

    var header = document.createElement("header");
    header.className = "msk-header";

    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "msk-icon-btn";
    backBtn.setAttribute("aria-label", "Back");
    backBtn.appendChild(document.createTextNode("\u2190"));
    backBtn.addEventListener("click", function () {
      if (self.state.screen === "details") self.goToScreen("tips");
      else if (self.state.screen === "preview") self.goToScreen("details");
    });

    var title = document.createElement("h2");
    title.className = "msk-header-title";
    title.id = "msk-modal-title";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "msk-icon-btn";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.appendChild(document.createTextNode("\u00D7"));
    closeBtn.addEventListener("click", function () {
      self.closeModal();
    });

    header.appendChild(backBtn);
    header.appendChild(title);
    header.appendChild(closeBtn);

    var body = document.createElement("div");
    body.className = "msk-body";

    var screens = document.createElement("div");
    screens.className = "msk-screens";
    screens.setAttribute("data-screen", "tips");
    screens.setAttribute("data-active", "tips");

    var tipsWrap = document.createElement("div");
    tipsWrap.className = "msk-screen";
    tipsWrap.setAttribute("data-screen", "tips");

    var detailsWrap = document.createElement("div");
    detailsWrap.className = "msk-screen";
    detailsWrap.setAttribute("data-screen", "details");

    var previewWrap = document.createElement("div");
    previewWrap.className = "msk-screen";
    previewWrap.setAttribute("data-screen", "preview");

    screens.appendChild(tipsWrap);
    screens.appendChild(detailsWrap);
    screens.appendChild(previewWrap);

    body.appendChild(screens);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) self.closeModal();
    });

    this._els.overlay = overlay;
    this._els.headerTitle = title;
    this._els.screens = screens;
    this._els.tipsWrap = tipsWrap;
    this._els.detailsWrap = detailsWrap;
    this._els.previewWrap = previewWrap;
    this._els.backBtn = backBtn;

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.setAttribute("aria-hidden", "true");
    fileInput.style.position = "absolute";
    fileInput.style.width = "0";
    fileInput.style.height = "0";
    fileInput.style.opacity = "0";
    fileInput.style.pointerEvents = "none";
    overlay.appendChild(fileInput);
    this._els.fileInput = fileInput;

    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      self.state.photoFile = f;
      self.state.uploadedCdnUrl = null;
      var reader = new FileReader();
      reader.onload = function () {
        self.state.photoUrl = reader.result;
        fileInput.value = "";
        if (self.state.screen === "tips") {
          self.goToScreen("details");
        }
        self.renderDetailsScreen();
        self.renderPreviewScreen();
      };
      reader.readAsDataURL(f);
    });

    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      overlay.classList.add("msk-open");
    });

    this.renderTipsScreen();
    this.renderDetailsScreen();
    this.renderPreviewScreen();
    this.goToScreen("tips");

    this._installFocusTrap(overlay);
    var keyHandler = function (e) {
      if (e.key === "Escape") self.closeModal();
    };
    overlay._mskKeyHandler = keyHandler;
    document.addEventListener("keydown", keyHandler);

    closeBtn.focus();
  },

  _installFocusTrap(container) {
    var selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    this._els.trapHandler = function (e) {
      if (e.key !== "Tab") return;
      var focusables = container.querySelectorAll(selector);
      var list = [];
      for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].offsetParent !== null) list.push(focusables[i]);
      }
      if (list.length === 0) return;
      var first = list[0];
      var last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    container.addEventListener("keydown", this._els.trapHandler);
  },

  closeModal() {
    var overlay = this._els.overlay;
    if (!overlay) return;
    document.removeEventListener("keydown", overlay._mskKeyHandler);
    if (this._els.trapHandler) {
      overlay.removeEventListener("keydown", this._els.trapHandler);
    }
    overlay.classList.remove("msk-open");
    var self = this;
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      self._els.overlay = null;
      self._els.headerTitle = null;
      self._els.screens = null;
      self._els.tipsWrap = null;
      self._els.detailsWrap = null;
      self._els.previewWrap = null;
      self._els.backBtn = null;
      self._els.fileInput = null;
      self._els.trapHandler = null;
      if (self._els.modalLastFocus && self._els.modalLastFocus.focus) {
        self._els.modalLastFocus.focus();
      }
    }, 260);
  },

  _clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  },

  renderTipsScreen() {
    var self = this;
    var wrap = this._els.tipsWrap;
    if (!wrap) return;
    this._clear(wrap);

    var tips = [
      { label: "Half size & good lighting", good: true },
      { label: "Well defined hair & clear BG", good: true },
      { label: "Body cut-off & bad lighting", good: false },
      { label: "Too far & complicated pose", good: false },
      { label: "Multiple faces & blurry", good: false },
      { label: "Obstruction on face", good: false },
    ];

    var grid = document.createElement("div");
    grid.className = "msk-photo-tips-grid";

    for (var i = 0; i < tips.length; i++) {
      (function (tip) {
        var card = document.createElement("div");
        card.className = "msk-tip-card";
        var img = document.createElement("div");
        img.className = "msk-tip-img";
        img.appendChild(document.createTextNode(tip.good ? "\u2705" : "\u274C"));
        var lbl = document.createElement("div");
        lbl.className = "msk-tip-label";
        lbl.appendChild(document.createTextNode(tip.label));
        var badge = document.createElement("span");
        badge.className =
          "msk-tip-badge " +
          (tip.good ? "msk-tip-badge-good" : "msk-tip-badge-bad");
        badge.appendChild(document.createTextNode(tip.good ? "\u2713" : "\u2715"));
        card.appendChild(badge);
        card.appendChild(img);
        card.appendChild(lbl);
        grid.appendChild(card);
      })(tips[i]);
    }

    wrap.appendChild(grid);

    var uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.className = "msk-add-btn";
    uploadBtn.appendChild(document.createTextNode("Upload Photo"));
    uploadBtn.addEventListener("click", function () {
      self._els.fileInput.click();
    });

    var skip = document.createElement("button");
    skip.type = "button";
    skip.className = "msk-link-btn";
    skip.appendChild(document.createTextNode("Skip"));
    skip.addEventListener("click", function () {
      self.goToScreen("details");
    });

    wrap.appendChild(uploadBtn);
    wrap.appendChild(skip);
  },

  renderDetailsScreen() {
    var self = this;
    var wrap = this._els.detailsWrap;
    if (!wrap) return;
    this._clear(wrap);

    var photoRow = document.createElement("div");
    photoRow.className = "msk-photo-row";

    var thumbWrap = document.createElement("div");
    thumbWrap.className = "msk-thumb-wrap";

    var thumb = document.createElement("img");
    thumb.className = "msk-thumb";
    thumb.alt = "";
    if (this.state.photoUrl) {
      thumb.src = this.state.photoUrl;
    } else {
      thumb.src =
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88"><rect fill="#e5e7eb" width="88" height="88" rx="12"/><circle cx="44" cy="36" r="14" fill="#9ca3af"/><ellipse cx="44" cy="72" rx="24" ry="14" fill="#9ca3af"/></svg>',
        );
    }

    var pencil = document.createElement("button");
    pencil.type = "button";
    pencil.className = "msk-pencil";
    pencil.setAttribute("aria-label", "Change photo");
    pencil.appendChild(document.createTextNode("\u270E"));
    pencil.addEventListener("click", function () {
      self._els.fileInput.click();
    });

    thumbWrap.appendChild(thumb);
    thumbWrap.appendChild(pencil);
    photoRow.appendChild(thumbWrap);
    wrap.appendChild(photoRow);

    var themeLabel = document.createElement("div");
    themeLabel.className = "msk-label";
    themeLabel.appendChild(document.createTextNode("Theme"));
    wrap.appendChild(themeLabel);

    var scroll = document.createElement("div");
    scroll.className = "msk-theme-scroll";
    for (var t = 0; t < this.themes.length; t++) {
      (function (th) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "msk-theme-chip";
        if (th.id === self.state.theme) chip.classList.add("msk-selected");
        chip.appendChild(document.createTextNode(th.label));
        chip.addEventListener("click", function () {
          self.state.theme = th.id;
          var chips = scroll.querySelectorAll(".msk-theme-chip");
          for (var c = 0; c < chips.length; c++) chips[c].classList.remove("msk-selected");
          chip.classList.add("msk-selected");
          self.renderPreviewScreen();
        });
        scroll.appendChild(chip);
      })(this.themes[t]);
    }
    wrap.appendChild(scroll);

    function addField(id, labelText, required, maxLen, placeholder) {
      var field = document.createElement("div");
      field.className = "msk-field";
      var lab = document.createElement("label");
      lab.className = "msk-label";
      lab.setAttribute("for", "msk-f-" + id);
      lab.appendChild(document.createTextNode(labelText + (required ? " *" : "")));
      var inp = document.createElement("input");
      inp.className = "msk-input";
      inp.id = "msk-f-" + id;
      inp.maxLength = maxLen;
      if (placeholder) inp.placeholder = placeholder;
      inp.value = self.state[id] || "";
      inp.addEventListener("input", function () {
        self.state[id] = inp.value;
        self.renderPreviewScreen();
      });
      field.appendChild(lab);
      field.appendChild(inp);
      wrap.appendChild(field);
      return inp;
    }

    addField("name", "Name", true, 20, "");
    addField("school", "School", false, 40, "");
    addField("std", "Standard", false, 10, "e.g. UKG, Grade 3");
    addField("rollNo", "Roll No", false, 10, "");

    var err = document.createElement("div");
    err.className = "msk-inline-error";
    err.setAttribute("role", "alert");

    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "msk-link-btn";
    reset.appendChild(document.createTextNode("Reset form"));
    reset.addEventListener("click", function () {
      self.state.name = "";
      self.state.school = "";
      self.state.std = "";
      self.state.rollNo = "";
      self.state.theme = "animal";
      self.state.photoFile = null;
      self.state.photoUrl = null;
      self.state.uploadedCdnUrl = null;
      self.renderDetailsScreen();
      self.renderPreviewScreen();
    });

    var previewLink = document.createElement("button");
    previewLink.type = "button";
    previewLink.className = "msk-link-btn";
    previewLink.appendChild(document.createTextNode("Preview"));
    previewLink.addEventListener("click", function () {
      err.textContent = "";
      if (!self.state.name || !self.state.name.trim()) {
        err.appendChild(document.createTextNode("Please enter a name."));
        return;
      }
      self.goToScreen("preview");
      self.renderPreviewScreen();
    });

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "msk-add-btn";
    addBtn.appendChild(document.createTextNode("ADD TO CART"));

    addBtn.addEventListener("click", async function () {
      err.textContent = "";
      if (!self.state.name || !self.state.name.trim()) {
        err.appendChild(document.createTextNode("Please enter a name."));
        return;
      }
      if (self.state.photoFile && !self.state.apiUrl) {
        err.appendChild(
          document.createTextNode("Configure Photo upload API URL to upload a photo."),
        );
        return;
      }
      addBtn.disabled = true;
      var labelNode = document.createTextNode("ADD TO CART");
      var spin = document.createElement("span");
      spin.className = "msk-spinner";
      addBtn.textContent = "";
      addBtn.appendChild(spin);
      try {
        var cdn =
          self.state.uploadedCdnUrl ||
          (self.state.photoFile ? await self.uploadPhoto(self.state.photoFile) : "");
        if (self.state.photoFile && !cdn) {
          throw new Error("Upload failed");
        }
        await self.addToCart(cdn || "");
        self.closeModal();
      } catch (e) {
        err.appendChild(
          document.createTextNode(e.message || "Something went wrong."),
        );
      } finally {
        addBtn.disabled = false;
        addBtn.textContent = "";
        addBtn.appendChild(labelNode);
      }
    });

    wrap.appendChild(err);
    wrap.appendChild(reset);
    wrap.appendChild(previewLink);
    wrap.appendChild(addBtn);

    var legal = document.createElement("div");
    legal.className = "msk-legal";
    var p = document.createElement("span");
    p.appendChild(document.createTextNode("By continuing you agree to our "));
    var a1 = document.createElement("a");
    a1.href = "https://policies.google.com/privacy";
    a1.target = "_blank";
    a1.rel = "noopener noreferrer";
    a1.appendChild(document.createTextNode("Privacy Policy"));
    var mid = document.createTextNode(" and ");
    var a2 = document.createElement("a");
    a2.href = "https://www.shopify.com/legal/terms";
    a2.target = "_blank";
    a2.rel = "noopener noreferrer";
    a2.appendChild(document.createTextNode("Terms"));
    p.appendChild(a1);
    p.appendChild(mid);
    p.appendChild(a2);
    p.appendChild(document.createTextNode("."));
    legal.appendChild(p);
    wrap.appendChild(legal);
  },

  renderPreviewScreen() {
    var self = this;
    var wrap = this._els.previewWrap;
    if (!wrap) return;
    this._clear(wrap);

    var card = document.createElement("div");
    card.className = "msk-preview-card";

    var photo = document.createElement("img");
    photo.className = "msk-preview-photo";
    photo.alt = "";
    if (this.state.photoUrl) {
      photo.src = this.state.photoUrl;
    } else {
      photo.src =
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle fill="#fff" cx="36" cy="36" r="36"/><circle cx="36" cy="30" r="12" fill="#c4b5fd"/><ellipse cx="36" cy="58" rx="20" ry="10" fill="#c4b5fd"/></svg>',
        );
    }

    var textCol = document.createElement("div");
    textCol.className = "msk-preview-text";

    var nm = document.createElement("div");
    nm.className = "msk-preview-name";
    nm.appendChild(
      document.createTextNode((this.state.name || "NAME").toUpperCase()),
    );

    var school = document.createElement("div");
    school.className = "msk-preview-line";
    school.appendChild(document.createTextNode(this.state.school || "School"));

    var sr = document.createElement("div");
    sr.className = "msk-preview-line";
    var stdPart = this.state.std ? "Std " + this.state.std : "";
    var rollPart = this.state.rollNo ? "Roll " + this.state.rollNo : "";
    sr.appendChild(
      document.createTextNode([stdPart, rollPart].filter(Boolean).join(" \u00B7 ")),
    );

    textCol.appendChild(nm);
    textCol.appendChild(school);
    textCol.appendChild(sr);

    var em = document.createElement("span");
    em.className = "msk-preview-emoji";
    em.appendChild(
      document.createTextNode(this.themeEmoji[this.state.theme] || ""),
    );

    card.appendChild(photo);
    card.appendChild(textCol);
    card.appendChild(em);
    wrap.appendChild(card);

    var err = document.createElement("div");
    err.className = "msk-inline-error";
    err.setAttribute("role", "alert");

    var confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "msk-add-btn";
    confirm.appendChild(document.createTextNode("Confirm & Add to Cart"));

    confirm.addEventListener("click", async function () {
      err.textContent = "";
      if (!self.state.name || !self.state.name.trim()) {
        err.appendChild(document.createTextNode("Please enter a name."));
        return;
      }
      if (self.state.photoFile && !self.state.apiUrl) {
        err.appendChild(
          document.createTextNode("Configure Photo upload API URL to upload a photo."),
        );
        return;
      }
      confirm.disabled = true;
      var labelNode = document.createTextNode("Confirm & Add to Cart");
      var spin = document.createElement("span");
      spin.className = "msk-spinner";
      confirm.textContent = "";
      confirm.appendChild(spin);
      try {
        var cdn =
          self.state.uploadedCdnUrl ||
          (self.state.photoFile ? await self.uploadPhoto(self.state.photoFile) : "");
        if (self.state.photoFile && !cdn) {
          throw new Error("Upload failed");
        }
        await self.addToCart(cdn || "");
        self.closeModal();
      } catch (e) {
        err.appendChild(
          document.createTextNode(e.message || "Something went wrong."),
        );
      } finally {
        confirm.disabled = false;
        confirm.textContent = "";
        confirm.appendChild(labelNode);
      }
    });

    var edit = document.createElement("button");
    edit.type = "button";
    edit.className = "msk-link-btn";
    edit.appendChild(document.createTextNode("Edit Details"));
    edit.addEventListener("click", function () {
      self.goToScreen("details");
    });

    wrap.appendChild(err);
    wrap.appendChild(confirm);
    wrap.appendChild(edit);
  },

  async uploadPhoto(file) {
    if (!this.state.apiUrl) {
      this.showToast("Configure Photo upload API URL in theme editor", "error");
      throw new Error("Photo upload URL is not configured.");
    }
    var fd = new FormData();
    fd.append("file", file);
    var res;
    try {
      res = await fetch(this.state.apiUrl, {
        method: "POST",
        body: fd,
        credentials: "omit",
        mode: "cors",
      });
    } catch (networkErr) {
      throw new Error(
        "Failed to reach upload server (network/CORS). Use your shop App Proxy URL: …/apps/myskool/api/upload-photo — deploy the app after enabling App Proxy.",
      );
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        var preview = text.replace(/\s+/g, " ").slice(0, 160);
        throw new Error(
          "Upload server returned non-JSON (HTTP " +
            res.status +
            "). " +
            (preview || "(empty body)") +
            (res.status === 404
              ? " — wrong URL or App Proxy not deployed."
              : ""),
        );
      }
    }
    if (!res.ok) {
      var errMsg = (data && data.error) || "Upload failed.";
      if (data && data.hint) {
        errMsg = errMsg + " " + data.hint;
      }
      throw new Error(errMsg);
    }
    if (!data.cdnUrl) {
      throw new Error("Upload did not return a URL.");
    }
    this.state.uploadedCdnUrl = data.cdnUrl;
    return data.cdnUrl;
  },

  async addToCart(photoUrl) {
    if (!this.state.variantId) {
      throw new Error("Missing product variant.");
    }
    var body = {
      id: this.state.variantId,
      quantity: 1,
      properties: {
        _photo_url: photoUrl || "",
        _child_name: this.state.name,
        _school: this.state.school,
        _std: this.state.std,
        _roll_no: this.state.rollNo,
        _theme: this.state.theme,
      },
    };
    var res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("Could not read cart response.");
    }
    if (!res.ok) {
      var msg =
        (data && (data.description || data.message)) || "Could not add to cart.";
      throw new Error(msg);
    }
    this.showToast("Added to cart!", "success");
    this._refreshCartCount();
  },

  _refreshCartCount() {
    fetch("/cart.js")
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        var n = cart && typeof cart.item_count === "number" ? cart.item_count : 0;
        var el =
          document.querySelector("[data-cart-count]") ||
          document.querySelector(".cart-count-bubble span");
        if (el) el.textContent = String(n);
      })
      .catch(function () {});
  },

  goToScreen(screen) {
    this.state.screen = screen;
    if (!this._els.headerTitle || !this._els.screens || !this._els.backBtn) return;

    var titles = {
      tips: "Photo Tips",
      details: "Enter Details",
      preview: "Preview",
    };
    this._clear(this._els.headerTitle);
    this._els.headerTitle.appendChild(
      document.createTextNode(titles[screen] || ""),
    );

    this._els.screens.setAttribute("data-screen", screen);
    this._els.screens.setAttribute("data-active", screen);

    this._els.backBtn.style.visibility =
      screen === "tips" ? "hidden" : "visible";
  },

  showToast(message, type) {
    type = type || "success";
    var t = document.createElement("div");
    t.className =
      "msk-toast " +
      (type === "error" ? "msk-toast-error" : "msk-toast-success");
    t.appendChild(document.createTextNode(message));
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      t.classList.add("msk-toast-visible");
    });
    setTimeout(function () {
      t.classList.remove("msk-toast-visible");
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 300);
    }, 3000);
  },
};

document.addEventListener("DOMContentLoaded", function () {
  MySkoolWidget.init();
});
