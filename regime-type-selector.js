
(function () {
  "use strict";

  const DEFAULT_ALL_TYPES_COLOR = "#4a5878";

  function defaultKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function createMarkup(root) {
    root.dataset.open = "false";
    root.innerHTML = `
      <button
        id="regime-type-trigger"
        class="regime-type-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="regime-type-list"
      >
        <span
          class="regime-type-swatch"
          id="regime-type-active-swatch"
          aria-hidden="true"
        ></span>
        <span class="regime-type-trigger-copy">
          <small>Regime shift type</small>
          <strong id="regime-type-active-label">All types</strong>
        </span>
        <span class="regime-type-chevron" aria-hidden="true">⌄</span>
      </button>

      <div id="regime-type-glass" class="regime-type-glass" hidden>
        <div
          id="regime-type-list"
          class="regime-type-list"
          role="listbox"
          aria-label="Regime shift types"
        ></div>
      </div>
    `;
  }

  function init(options = {}) {
    const root = typeof options.root === "string"
      ? document.querySelector(options.root)
      : options.root;

    if (!root) {
      console.warn("RegimeTypeSelector: root element not found.");
      return null;
    }

    root._regimeTypeSelector?.destroy?.();
    createMarkup(root);

    const geojson = options.geojson || { type: "FeatureCollection", features: [] };
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    const types = Array.isArray(options.types) ? options.types : [];
    const getKey = options.getKey || defaultKey;
    const getColor = options.getColor || (() => DEFAULT_ALL_TYPES_COLOR);
    const allTypesColor = options.allTypesColor || DEFAULT_ALL_TYPES_COLOR;
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    const abortController = new AbortController();
    const { signal } = abortController;

    const trigger = root.querySelector("#regime-type-trigger");
    const glass = root.querySelector("#regime-type-glass");
    const list = root.querySelector("#regime-type-list");
    const activeLabel = root.querySelector("#regime-type-active-label");
    const activeSwatch = root.querySelector("#regime-type-active-swatch");

    let activeKey = options.initialKey || "";

    const counts = new Map();
    for (const feature of features) {
      const label = feature.properties?.regime_type || "";
      const key = getKey(label);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const entries = types.map(entry => ({
      key: getKey(entry.label),
      label: entry.label,
      count: counts.get(getKey(entry.label)) || 0,
      color: entry.color || getColor(entry.label)
    }));

    function setOpen(open) {
      root.dataset.open = String(open);
      trigger.setAttribute("aria-expanded", String(open));
      glass.hidden = !open;
    }

    function selectionFor(typeKey = "") {
      const selectedFeatures = typeKey
        ? features.filter(feature => getKey(feature.properties?.regime_type) === typeKey)
        : features;

      const definition = entries.find(entry => entry.key === typeKey);
      const label = typeKey
        ? (definition?.label || selectedFeatures[0]?.properties?.regime_type || "Selected type")
        : "All types";
      const color = typeKey
        ? (definition?.color || getColor(label))
        : allTypesColor;

      return {
        key: typeKey,
        label,
        color,
        count: selectedFeatures.length,
        features: selectedFeatures,
        geojson: {
          type: "FeatureCollection",
          features: selectedFeatures
        }
      };
    }

    function select(typeKey = "", { notify = true } = {}) {
      activeKey = typeKey;
      const selection = selectionFor(typeKey);

      activeLabel.textContent = selection.label;
      activeSwatch.style.setProperty("--type-color", selection.color);

      list.querySelectorAll(".regime-type-option").forEach(option => {
        option.setAttribute(
          "aria-selected",
          String(option.dataset.typeKey === activeKey)
        );
      });

      if (notify) onChange(selection);
      return selection;
    }

    function makeOption({ key, label, count, color }) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "regime-type-option";
      button.dataset.typeKey = key;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(key === activeKey));
      button.style.setProperty("--type-color", color);

      const swatch = document.createElement("span");
      swatch.className = "regime-type-swatch";
      swatch.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = label;

      const number = document.createElement("span");
      number.className = "regime-type-count";
      number.textContent = count.toLocaleString();

      button.append(swatch, text, number);
      button.addEventListener("click", () => {
        select(key);
        setOpen(false);
        trigger.focus();
      }, { signal });

      list.appendChild(button);
    }

    list.replaceChildren();
    makeOption({
      key: "",
      label: "All types",
      count: features.length,
      color: allTypesColor
    });
    entries.forEach(makeOption);

    trigger.addEventListener("click", () => {
      setOpen(trigger.getAttribute("aria-expanded") !== "true");
    }, { signal });

    trigger.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        list.querySelector(".regime-type-option")?.focus();
      }
    }, { signal });

    list.addEventListener("keydown", event => {
      const optionElements = [...list.querySelectorAll(".regime-type-option")];
      const index = optionElements.indexOf(document.activeElement);

      if (event.key === "Escape") {
        setOpen(false);
        trigger.focus();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        optionElements[(index + delta + optionElements.length) % optionElements.length]?.focus();
      }
    }, { signal });

    document.addEventListener("pointerdown", event => {
      if (!root.contains(event.target)) setOpen(false);
    }, { signal });

    const api = {
      select,
      open: () => setOpen(true),
      close: () => setOpen(false),
      getValue: () => activeKey,
      destroy() {
        abortController.abort();
        root.replaceChildren();
        delete root._regimeTypeSelector;
      }
    };

    root._regimeTypeSelector = api;
    select(activeKey, { notify: options.notifyOnInit !== false });
    return api;
  }

  window.RegimeTypeSelector = { init };
})();
