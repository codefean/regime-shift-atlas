(() => {
  'use strict';

  const GEOJSON_URL = 'data/marine-land-countries.geojson';
  const REGIME_DATABASE_URL = 'data/regime_shift_database.csv';
  const statusElement = document.getElementById('map-status');
  const searchInput = document.getElementById('country-search');
  const searchButton = document.getElementById('search-button');
  const mapSection = document.getElementById('world-map');
  const aboutSection = document.getElementById('about');
  const sectionNavLinks = [...document.querySelectorAll('.site-nav [data-nav-section]')];
  const mapInteractionToggle = document.getElementById('map-interaction-toggle');
  const mobileCountryAction = document.getElementById('mobile-country-action');
  const mobileCountryName = document.getElementById('mobile-country-name');
  const mobileCountryOpen = document.getElementById('mobile-country-open');
  const mobileCountryClear = document.getElementById('mobile-country-clear');
  const coarsePointerQuery = window.matchMedia('(hover: none), (pointer: coarse)');
  const mobileMapMode = coarsePointerQuery.matches;
  let navigationStarted = false;
  let mapInteractionEnabled = !mobileMapMode;
  let selectedMobileCountry = null;

  const defaultStyle = {
    color: '#71808d',
    weight: 0.7,
    opacity: 0.9,
    fillColor: '#cfe0ef',
    fillOpacity: 0.17
  };

  const disputedStyle = {
    color: '#8a6d3b',
    weight: 0.9,
    opacity: 0.95,
    dashArray: '4 3',
    fillColor: '#f3dfaa',
    fillOpacity: 0.13
  };

  const hoverStyle = {
    color: '#1f4c99df',
    weight: 1.6,
    opacity: 1,
    fillColor: '#3366cc',
    fillOpacity: 0.38
  };

  const map = L.map('map', {
    minZoom: 2.14,
    maxZoom: 7,
    zoomControl: true,
    worldCopyJump: true,
    maxBoundsViscosity: 0.85,
    attributionControl: true
  }).setView([18, 8], 2);

  map.setMaxBounds([[-85, -220], [85, 220]]);

  const mapInteractionHandlers = [
    map.dragging,
    map.touchZoom,
    map.doubleClickZoom,
    map.scrollWheelZoom,
    map.boxZoom,
    map.keyboard
  ].filter(Boolean);

  function setMapInteractionEnabled(enabled) {
    mapInteractionEnabled = !mobileMapMode || enabled;
    for (const handler of mapInteractionHandlers) {
      if (mapInteractionEnabled) handler.enable();
      else handler.disable();
    }
    map.getContainer().classList.toggle('map-interaction-enabled', mapInteractionEnabled);
    if (mapInteractionToggle) {
      mapInteractionToggle.hidden = !mobileMapMode;
      mapInteractionToggle.setAttribute('aria-pressed', String(mapInteractionEnabled));
      mapInteractionToggle.textContent = mapInteractionEnabled ? 'Exit map' : 'Explore map';
    }
  }

  setMapInteractionEnabled(mapInteractionEnabled);


  function setActiveNavigation(sectionId) {
    for (const link of sectionNavLinks) {
      const isActive = link.dataset.navSection === sectionId;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function restoreRequestedSection() {
    const shouldReturnToMap = window.location.hash === '#world-map' ||
      window.history.state?.returnToMap === true;
    const requestedSection = window.location.hash === '#about'
      ? aboutSection
      : shouldReturnToMap
        ? mapSection
        : null;

    if (!requestedSection) return;

    window.requestAnimationFrame(() => {
      requestedSection.scrollIntoView({ behavior: 'auto', block: 'start' });
      setActiveNavigation(requestedSection.id);
      if (requestedSection === mapSection) {
        window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
      }
    });
  }

  function observeHomepageSections() {
    if (!('IntersectionObserver' in window)) return;

    const sections = [mapSection, aboutSection].filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const visibleSections = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visibleSections[0]) setActiveNavigation(visibleSections[0].target.id);
    }, {
      rootMargin: '-20% 0px -55% 0px',
      threshold: [0, 0.1, 0.25, 0.5]
    });

    sections.forEach(section => observer.observe(section));
  }

  sectionNavLinks.forEach(link => {
    link.addEventListener('click', () => setActiveNavigation(link.dataset.navSection));
  });

  observeHomepageSections();

  window.addEventListener('pageshow', () => {
    navigationStarted = false;
    restoreRequestedSection();
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  map.createPane('regimePointsPane');
  map.getPane('regimePointsPane').style.zIndex = '450';
  map.getPane('regimePointsPane').style.pointerEvents = 'none';

  let countriesLayer;
  let regimePointsLayer;
  const layersByCode = new Map();
  const countryIndex = new Map();
  let activeCode = null;
  let resetTimer = null;
  let tooltipCloseTimer = null;


  const hoverLabel = document.createElement('div');
  hoverLabel.className = 'country-hover-label';
  hoverLabel.hidden = true;
  hoverLabel.setAttribute('aria-hidden', 'true');
  map.getContainer().appendChild(hoverLabel);

  function cleanCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return code && code !== '-99' ? code : '';
  }

  function primaryCountryCode(properties) {
    return cleanCode(properties.ISO_SOV1) ||
      cleanCode(properties.ISO_TER1) ||
      (properties.UNION === 'Antarctica' ? 'ATA' : '');
  }

  function allCountryCodes(properties) {
    const codes = [properties.ISO_SOV1, properties.ISO_SOV2, properties.ISO_SOV3]
      .map(cleanCode)
      .filter(Boolean);

    const primary = primaryCountryCode(properties);
    if (primary) codes.unshift(primary);
    return [...new Set(codes)];
  }

  function primaryCountryName(properties) {
    return properties.SOVEREIGN1 || properties.TERRITORY1 || properties.UNION || 'Unknown country';
  }

  function zoneDescription(properties) {
    const type = String(properties.POL_TYPE || '').toLowerCase();
    if (type.includes('overlapping')) return 'overlapping maritime claim';
    if (type.includes('joint')) return 'joint maritime regime';
    if (type.includes('landlocked')) return 'land boundary';
    return '';
  }

  function styleFeature(feature) {
    const type = String(feature?.properties?.POL_TYPE || '').toLowerCase();
    return type.includes('overlapping') || type.includes('joint')
      ? disputedStyle
      : defaultStyle;
  }

  function addLayerToCode(code, layer) {
    if (!code) return;
    if (!layersByCode.has(code)) layersByCode.set(code, []);
    layersByCode.get(code).push(layer);
  }

  function addCountryAlias(code, name) {
    const normalizedName = normalize(name);
    if (!code || !normalizedName) return;

    if (!countryIndex.has(code)) {
      countryIndex.set(code, {
        code,
        name: String(name).trim(),
        aliases: new Set()
      });
    }

    countryIndex.get(code).aliases.add(normalizedName);
  }

  function indexFeature(feature) {
    const properties = feature.properties || {};
    const numbered = [1, 2, 3];

    for (const number of numbered) {
      const code = cleanCode(properties[`ISO_SOV${number}`]);
      if (!code) continue;
      addCountryAlias(code, properties[`SOVEREIGN${number}`]);
      addCountryAlias(code, properties[`TERRITORY${number}`]);
      if (number === 1) addCountryAlias(code, properties.UNION);
    }

    const fallbackCode = primaryCountryCode(properties);
    if (fallbackCode && !countryIndex.has(fallbackCode)) {
      addCountryAlias(fallbackCode, primaryCountryName(properties));
    }
  }

  function countryRecord(code, properties = {}) {
    return countryIndex.get(code) || {
      code,
      name: primaryCountryName(properties),
      aliases: new Set()
    };
  }

  function setCountryStyle(code, style) {
    for (const layer of layersByCode.get(code) || []) {
      layer.setStyle(style);
    }
  }

  function resetCountry(code) {
    if (!countriesLayer || !code) return;
    for (const layer of layersByCode.get(code) || []) {
      countriesLayer.resetStyle(layer);
    }
  }

  function highlightCountry(code) {
    if (!code) return;
    if (resetTimer) window.clearTimeout(resetTimer);

    if (activeCode === code) return;

    if (activeCode) resetCountry(activeCode);
    activeCode = code;
    setCountryStyle(code, hoverStyle);
  }

  function positionHoverLabel(event) {
    const point = event.containerPoint || map.mouseEventToContainerPoint(event.originalEvent);
    hoverLabel.style.left = `${point.x}px`;
    hoverLabel.style.top = `${point.y}px`;
  }

  function showTooltip(event, text) {
    if (tooltipCloseTimer) window.clearTimeout(tooltipCloseTimer);
    hoverLabel.textContent = text;
    hoverLabel.hidden = false;
    positionHoverLabel(event);
  }

  function moveTooltip(event) {
    if (!hoverLabel.hidden) positionHoverLabel(event);
  }

  function closeTooltip() {
    if (tooltipCloseTimer) window.clearTimeout(tooltipCloseTimer);
    hoverLabel.hidden = true;
  }

  function scheduleTooltipClose() {
    if (tooltipCloseTimer) window.clearTimeout(tooltipCloseTimer);
    tooltipCloseTimer = window.setTimeout(closeTooltip, 60);
  }

  function scheduleReset(code) {
    if (resetTimer) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      if (activeCode === code) {
        resetCountry(code);
        activeCode = null;
        statusElement.textContent = '';
      }
    }, 35);
  }

  function countryBounds(code) {
    const group = L.featureGroup(layersByCode.get(code) || []);
    return group.getLayers().length ? group.getBounds() : null;
  }

  function openCountry(code, properties = {}) {
    if (!code || navigationStarted) return;
    navigationStarted = true;

    const record = countryRecord(code, properties);
    const name = record.name || primaryCountryName(properties);
    const targetUrl = new URL('country.html', window.location.href);
    targetUrl.search = new URLSearchParams({ code, name }).toString();

    try {
      sessionStorage.setItem(`earth-atlas:${code}`, JSON.stringify({ code, name }));
    } catch (error) {
      console.warn('Country cache unavailable:', error);
    }

    try {
      window.history.replaceState(
        { ...(window.history.state || {}), returnToMap: true },
        document.title,
        window.location.href
      );
    } catch (error) {
      console.warn('Unable to save the map return position:', error);
    }

    statusElement.textContent = `Opening ${name}…`;
    window.location.assign(targetUrl.href);
  }

  function clearMobileSelection({ resetHighlight = true } = {}) {
    if (!selectedMobileCountry) return;
    const previousCode = selectedMobileCountry.code;
    selectedMobileCountry = null;
    if (mobileCountryAction) mobileCountryAction.hidden = true;
    if (mobileCountryName) mobileCountryName.textContent = '';
    if (resetHighlight && activeCode === previousCode) {
      resetCountry(previousCode);
      activeCode = null;
    }
  }

  function selectMobileCountry(code, properties = {}, label = '') {
    const record = countryRecord(code, properties);
    const name = record.name || primaryCountryName(properties);
    selectedMobileCountry = { code, properties, name };
    highlightCountry(code);
    closeTooltip();
    if (mobileCountryName) mobileCountryName.textContent = name;
    if (mobileCountryAction) mobileCountryAction.hidden = false;
    statusElement.textContent = `${label || name} selected. Tap it again or use Open profile.`;
  }

  function activateCountry(code, properties = {}, label = '') {
    if (!code) return;
    if (!mobileMapMode) {
      openCountry(code, properties);
      return;
    }
    if (selectedMobileCountry?.code === code) {
      openCountry(code, properties);
      return;
    }
    selectMobileCountry(code, properties, label);
  }

function onEachCountry(feature, layer) {
  const properties = feature.properties || {};
  const code = primaryCountryCode(properties);
  const name = primaryCountryName(properties);
  const description = zoneDescription(properties);

  const claimants = [
    properties.SOVEREIGN1,
    properties.SOVEREIGN2,
    properties.SOVEREIGN3
  ].filter(Boolean);

  const isUkraine =
    code === 'UKR' ||
    properties.UNION === 'Ukraine';

  const isTaiwan =
    code === 'TWN' ||
    properties.UNION === 'Taiwan' ||
    properties.TERRITORY1 === 'Taiwan';

  const tooltipName = isUkraine
    ? 'Ukraine'
    : isTaiwan
      ? 'Taiwan'
      : claimants.length > 1
        ? claimants.join(' / ')
        : name;

  const associatedCodes = allCountryCodes(properties);

  const isUkraineRussiaFeature =
    associatedCodes.includes('UKR') &&
    associatedCodes.includes('RUS');

  const isTaiwanChinaFeature =
    associatedCodes.includes('TWN') &&
    associatedCodes.includes('CHN');

  if (isUkraineRussiaFeature || isTaiwanChinaFeature) {
    addLayerToCode(code, layer);
  } else {
    for (const associatedCode of associatedCodes) {
      addLayerToCode(associatedCode, layer);
    }
  }

  const tooltipText = `${tooltipName} ${description}`.trim();

    layer.on({
      mouseover(event) {
        highlightCountry(code);
        showTooltip(event, tooltipText);
        statusElement.textContent = ``;
      },
      mousemove(event) {
        moveTooltip(event);
      },
      mouseout() {
        scheduleTooltipClose();
        scheduleReset(code);
      },
      click(event) {
        event.originalEvent?.preventDefault();
        event.originalEvent?.stopPropagation();
        activateCountry(code, properties, tooltipText);
      }
    });

    layer.on('add', () => {
      const path = layer.getElement?.();
      if (!path || !code || path.dataset.countryLinkBound === 'true') return;

      path.dataset.countryLinkBound = 'true';
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'link');
      path.setAttribute('aria-label', mobileMapMode ? `Select ${name}; activate again to open` : `Open ${name}`);
      path.style.cursor = 'pointer';


      path.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        openCountry(code, properties);
      });
    });
  }

  async function loadCountries() {
    try {
      const response = await fetch(GEOJSON_URL);
      if (!response.ok) throw new Error(`Marine and land data returned ${response.status}`);

      const geojson = await response.json();
      for (const feature of geojson.features || []) indexFeature(feature);

      countriesLayer = L.geoJSON(geojson, {
        style: styleFeature,
        onEachFeature: onEachCountry
      }).addTo(map);

      statusElement.textContent = '';
    } catch (error) {
      console.error(error);
      statusElement.textContent = 'Marine and land boundaries could not be loaded. Run the site through a local web server and reload.';
    }
  }


  async function loadRegimePoints() {
    if (!window.RegimeData) throw new Error('The shared regime-data module is unavailable.');

    const dataset = await window.RegimeData.loadCsv(REGIME_DATABASE_URL);
    const geojson = window.RegimeData.toFeatureCollection(dataset.points, dataset.metadata);
    const renderer = L.canvas({ pane: 'regimePointsPane', padding: 0.5 });

    regimePointsLayer = L.geoJSON(geojson, {
      pane: 'regimePointsPane',
      interactive: false,
      pointToLayer(feature, latlng) {
        return L.circleMarker(latlng, {
          pane: 'regimePointsPane',
          renderer,
          interactive: false,
          radius: 2.6,
          color: '#7a1f1f',
          weight: 0.6,
          opacity: 0.8,
          fillColor: '#b32424',
          fillOpacity: 0.72
        });
      }
    }).addTo(map);

    return dataset.metadata;
  }

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function searchCountry() {
    const query = normalize(searchInput.value);
    if (!query) {
      statusElement.textContent = 'Enter a country or territory name to search.';
      searchInput.focus();
      return;
    }

    if (!countriesLayer || countryIndex.size === 0) {
      statusElement.textContent = 'Country data is still loading.';
      return;
    }

    const records = [...countryIndex.values()];
    const exact = records.find(record => record.aliases.has(query));
    const partial = records.find(record => [...record.aliases].some(alias => alias.includes(query)));
    const match = exact || partial;

    if (!match) {
      statusElement.textContent = `No country or territory found for “${searchInput.value.trim()}”.`;
      return;
    }

    const bounds = countryBounds(match.code);
    if (!bounds || !bounds.isValid()) return;

    map.fitBounds(bounds, { padding: mobileMapMode ? [24, 24] : [40, 40], maxZoom: 5 });
    if (mobileMapMode) {
      selectMobileCountry(match.code, { SOVEREIGN1: match.name }, match.name);
    } else {
      highlightCountry(match.code);
      statusElement.textContent = `${match.name} — full land and maritime scope highlighted. Click any highlighted area to open its page.`;
      window.setTimeout(() => {
        if (activeCode === match.code) {
          resetCountry(match.code);
          activeCode = null;
        }
      }, 3200);
    }
  }

  mapInteractionToggle?.addEventListener('click', () => {
    setMapInteractionEnabled(!mapInteractionEnabled);
    if (!mapInteractionEnabled) mapInteractionToggle.blur();
  });

  mobileCountryOpen?.addEventListener('click', () => {
    if (!selectedMobileCountry) return;
    openCountry(selectedMobileCountry.code, selectedMobileCountry.properties);
  });

  mobileCountryClear?.addEventListener('click', () => {
    clearMobileSelection();
    statusElement.textContent = '';
  });

  map.on('click', event => {
    if (event.originalEvent?.defaultPrevented) return;
    if (mobileMapMode && selectedMobileCountry) {
      clearMobileSelection();
      statusElement.textContent = '';
    }
  });

  searchButton.addEventListener('click', searchCountry);
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') searchCountry();
  });

  map.getContainer().addEventListener('mouseleave', () => {
    if (mobileMapMode) return;
    if (resetTimer) window.clearTimeout(resetTimer);
    if (tooltipCloseTimer) window.clearTimeout(tooltipCloseTimer);
    closeTooltip();
    if (activeCode) resetCountry(activeCode);
    activeCode = null;
  });

  Promise.allSettled([loadCountries(), loadRegimePoints()]).then(results => {
    const [countryResult, pointResult] = results;

    if (countryResult.status === 'rejected') {
      console.error(countryResult.reason);
      statusElement.textContent = 'Marine and land boundaries could not be loaded. Run the site through a local web server and reload.';
      return;
    }

    if (pointResult.status === 'rejected') {
      console.error(pointResult.reason);
      statusElement.textContent = 'Country boundaries loaded, but regime-shift points could not be loaded from the CSV database.';
      return;
    }

    const metadata = pointResult.value || {};
    statusElement.textContent = metadata.invalidCoordinateRecords
      ? `${metadata.validCoordinateRecords.toLocaleString()} mapped records loaded; ${metadata.invalidCoordinateRecords.toLocaleString()} rows have invalid coordinates.`
      : '';
  });
})();
