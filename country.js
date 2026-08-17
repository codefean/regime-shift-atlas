(() => {
  'use strict';

  const COUNTRY_GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';
  const WORLD_BANK_API_URL = 'https://api.worldbank.org/v2';
  const BOUNDARY_GEOJSON_URL = 'data/marine-land-countries.geojson';
  const REGIME_DATABASE_URL = 'data/regime_shift_database.csv';
  const EARTH_RADIUS_METRES = 6378137;
  const INITIAL_CASE_LIMIT = 6;
  const CASE_PAGE_SIZE = 6;
  const INITIAL_TYPE_LIMIT = 8;

  const params = new URLSearchParams(window.location.search);
  const requestedCode = String(params.get('code') || '').trim().toUpperCase();
  const requestedName = String(params.get('name') || '').trim();
  const COUNTRY_API_CACHE_PREFIX = 'earth-atlas-api:';
  const COUNTRY_API_CACHE_LIFETIME = 24 * 60 * 60 * 1000;

  const htmlTextDecoder = document.createElement('div');
  const recordYearCache = new WeakMap();
  const recordSearchCache = new WeakMap();

  const state = {
    countryName: requestedName || requestedCode || 'This country',
    summary: null,
    caseLimit: INITIAL_CASE_LIMIT,
    caseListenersReady: false,
    showAllTypes: false,
    typeToggleReady: false,
    countryMap: null,
    countryMapBoundaryLayer: null,
    countryMapPointsLayer: null,
    countryMapInteractionReady: false
  };

  const WORLD_BANK_INDICATORS = {
  population: 'SP.POP.TOTL',
  gdp: 'NY.GDP.MKTP.CD',
  area: 'AG.SRF.TOTL.K2'
};

  const elements = {
    name: document.getElementById('country-name'),
    formalName: document.getElementById('country-formal-name'),
    population: document.getElementById('country-population'),
    populationYear: document.getElementById('population-year'),
    flag: document.getElementById('country-flag'),
    flagFallback: document.getElementById('flag-fallback'),
    codeBadge: document.getElementById('country-code-badge'),
    overview: document.getElementById('overview-copy'),
    indicatorArea: document.getElementById('indicator-area'),
    indicatorGdp: document.getElementById('indicator-gdp'),
    gdpYear: document.getElementById('gdp-year'),
    footerName: document.getElementById('footer-country-name'),
    analysisGrid: document.getElementById('analysis-grid'),
    countryMap: document.getElementById('country-map'),
    countryMapStatus: document.getElementById('country-map-status'),
    countryMapPointCount: document.getElementById('country-map-point-count'),
    countryMapInteractionToggle: document.getElementById('country-map-interaction-toggle'),
    typeChart: document.getElementById('type-chart'),
    typeToggle: document.getElementById('type-toggle'),
    ecosystemChart: document.getElementById('ecosystem-chart'),
    ecosystemCoverage: document.getElementById('ecosystem-coverage'),
    driverChart: document.getElementById('driver-chart'),
    driverCoverage: document.getElementById('driver-coverage'),
    impactProcesses: document.getElementById('impact-processes'),
    impactProvisioning: document.getElementById('impact-provisioning'),
    impactRegulating: document.getElementById('impact-regulating'),
    impactCultural: document.getElementById('impact-cultural'),
    impactWellbeing: document.getElementById('impact-wellbeing'),
    impactSdgs: document.getElementById('impact-sdgs'),
    timelineStatus: document.getElementById('timeline-status'),
    timelineChart: document.getElementById('timeline-chart'),
    timescaleChart: document.getElementById('timescale-chart'),
    timescaleCoverage: document.getElementById('timescale-coverage'),
    reversibilityChart: document.getElementById('reversibility-chart'),
    reversibilityCoverage: document.getElementById('reversibility-coverage'),
    existenceChart: document.getElementById('existence-chart'),
    existenceCoverage: document.getElementById('existence-coverage'),
    mechanismChart: document.getElementById('mechanism-chart'),
    mechanismCoverage: document.getElementById('mechanism-coverage'),
    evidenceSourceChart: document.getElementById('evidence-source-chart'),
    sourcesCoverage: document.getElementById('sources-coverage'),
    caseSearch: document.getElementById('case-search'),
    caseTypeFilter: document.getElementById('case-type-filter'),
    caseResultsStatus: document.getElementById('case-results-status'),
    caseStudyList: document.getElementById('case-study-list'),
    showMoreCases: document.getElementById('show-more-cases')
  };

  const TILE_WORLD_BOUNDS = L.latLngBounds(
  [-85.05112878, -180],
  [85.05112878, 180]
);



  const contentsLinks = [...document.querySelectorAll('.contents-card a[href^="#"]')];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setActiveContents(sectionId, bringIntoView = false) {
    for (const link of contentsLinks) {
      const isActive = link.hash === `#${sectionId}`;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'location');
        if (bringIntoView) {
          link.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }

  function initialiseContentsNavigation() {
    if (!contentsLinks.length) return;
    contentsLinks.forEach(link => {
      link.addEventListener('click', () => setActiveContents(link.hash.slice(1), true));
    });
    const sections = contentsLinks
      .map(link => document.querySelector(link.hash))
      .filter(Boolean);
    if (!('IntersectionObserver' in window)) {
      setActiveContents(sections[0]?.id || 'overview');
      return;
    }
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActiveContents(visible[0].target.id, true);
    }, {
      rootMargin: '-28% 0px -58% 0px',
      threshold: [0, 0.05, 0.2, 0.5]
    });
    sections.forEach(section => observer.observe(section));
    setActiveContents(window.location.hash.slice(1) || sections[0]?.id || 'overview');
  }

  initialiseContentsNavigation();

function getCachedCountry() {
  if (!requestedCode) return null;

  try {
    const stored = sessionStorage.getItem(
      `${COUNTRY_API_CACHE_PREFIX}${requestedCode}`
    );

    if (!stored) return null;

    const entry = JSON.parse(stored);

    if (!entry?.data) return null;

    return {
      data: entry.data,
      expired:
        !entry.cachedAt ||
        Date.now() - entry.cachedAt > COUNTRY_API_CACHE_LIFETIME
    };
  } catch (error) {
    console.warn('Country API cache unavailable:', error);
    return null;
  }
}

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function cleanDisplayText(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.toUpperCase() === 'NA') return '';
    htmlTextDecoder.innerHTML = raw;
    const text = String(htmlTextDecoder.textContent || raw).replace(/\s+/g, ' ').trim();
    htmlTextDecoder.replaceChildren();
    return text;
  }

  function truncate(text, maxLength = 520) {
    const clean = cleanDisplayText(text);
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
  }

  function sentenceCase(text) {
    const clean = cleanDisplayText(text).replace(/[.;]+$/, '');
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
  }

  function countryName(properties) {
    return properties.NAME_EN || properties.NAME_LONG || properties.ADMIN || properties.NAME || requestedName || 'Unknown country';
  }

  function countryCode(properties) {
    const candidates = [properties.ADM0_A3, properties.ISO_A3_EH, properties.ISO_A3, properties.SOV_A3];
    return candidates.find(code => code && code !== '-99') || requestedCode || '—';
  }

  function iso2Code(properties) {
    const candidates = [properties.ISO_A2_EH, properties.ISO_A2, properties.WB_A2, properties.POSTAL];
    return candidates.find(code => code && code !== '-99' && String(code).length === 2) || '';
  }

  function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatPopulation(value) {
    const parsed = finiteNumber(value);
    return parsed === null || parsed < 0 ? 'Unavailable' : new Intl.NumberFormat().format(parsed);
  }

  function formatGdp(value) {
    const parsed = finiteNumber(value);
    if (parsed === null || parsed < 0) return 'Unavailable';
    return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(parsed)}M`;
  }

  function formatArea(squareMetres) {
    const parsed = finiteNumber(squareMetres);
    if (parsed === null || parsed < 0) return 'Unavailable';
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(parsed / 1_000_000)} km²`;
  }

  function formatCount(value) {
    const parsed = finiteNumber(value);
    return new Intl.NumberFormat().format(parsed === null ? 0 : parsed);
  }

  function formatPercent(numerator, denominator) {
    if (!denominator) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
  }

  function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function ringArea(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 3) return 0;
    let total = 0;
    const length = coordinates.length;
    for (let index = 0; index < length; index += 1) {
      const lower = coordinates[index];
      const middle = coordinates[(index + 1) % length];
      const upper = coordinates[(index + 2) % length];
      total += (degreesToRadians(upper[0]) - degreesToRadians(lower[0])) * Math.sin(degreesToRadians(middle[1]));
    }
    return total * EARTH_RADIUS_METRES * EARTH_RADIUS_METRES / 2;
  }

  function polygonArea(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return 0;
    let area = Math.abs(ringArea(coordinates[0]));
    for (let index = 1; index < coordinates.length; index += 1) area -= Math.abs(ringArea(coordinates[index]));
    return Math.max(0, area);
  }

  function geometryArea(geometry) {
    if (!geometry) return null;
    if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.reduce((sum, polygonCoordinates) => sum + polygonArea(polygonCoordinates), 0);
    }
    return null;
  }

  function flagEmoji(iso2) {
    if (!iso2 || iso2.length !== 2) return '';
    return [...iso2.toUpperCase()].map(character => String.fromCodePoint(127397 + character.charCodeAt(0))).join('');
  }

  function renderFlag(name, iso2) {
    if (!elements.flag || !elements.flagFallback) return;
    elements.flagFallback.textContent = flagEmoji(iso2);
    elements.flagFallback.hidden = false;
    elements.flag.hidden = true;
    elements.flag.onload = null;
    elements.flag.onerror = null;
    if (!iso2) {
      elements.flag.removeAttribute('src');
      return;
    }
    elements.flag.onload = () => {
      elements.flag.hidden = false;
      elements.flagFallback.hidden = true;
    };
    elements.flag.onerror = () => {
      elements.flag.hidden = true;
      elements.flagFallback.hidden = false;
    };
    elements.flag.alt = `Flag of ${name}`;
    elements.flag.src = `https://flagcdn.com/${iso2}.svg`;
  }

  function renderCountry(data) {
    const name = data.name || requestedName || 'Unknown country';
    const code = data.code || requestedCode || '—';
    const iso2 = String(data.iso2 || '').toLowerCase();
    state.countryName = name;
    document.title = `${name} · Regime Shift Atlas`;
    if (elements.name) elements.name.textContent = name;
    if (elements.formalName) elements.formalName.textContent = data.formalName && data.formalName !== name ? data.formalName : '';
    if (elements.indicatorArea) elements.indicatorArea.textContent = formatArea(data.areaSquareMetres);
    if (elements.population) elements.population.textContent = formatPopulation(data.population);
    if (elements.populationYear) elements.populationYear.textContent = data.populationYear ? `Estimate - ${data.populationYear}` : 'Population estimate';
    if (elements.indicatorGdp) elements.indicatorGdp.textContent = formatGdp(data.gdp);
    if (elements.gdpYear) elements.gdpYear.textContent = data.gdpYear ? `Estimate - ${data.gdpYear}` : 'GDP estimate';
    if (elements.codeBadge) elements.codeBadge.textContent = code;
    if (elements.footerName) elements.footerName.textContent = `${name} reference page`;
    renderFlag(name, iso2);
    renderOverview();
  }

  function toCountryData(feature) {
    const properties = feature.properties || {};
    return {
      name: countryName(properties),
      code: countryCode(properties),
      iso2: iso2Code(properties),
      formalName: properties.FORMAL_EN || properties.NAME_LONG || '',
      population: properties.POP_EST,
      populationYear: properties.POP_YEAR,
      areaSquareMetres: geometryArea(feature.geometry),
      gdp: properties.GDP_MD,
      gdpYear: properties.GDP_YEAR
    };
  }

  function showError(message) {
    const article = document.querySelector('.country-article');
    if (!article) return;
    article.querySelector('.error-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = message;
    article.prepend(banner);
  }

  function splitList(value) {
    const source = cleanDisplayText(value);
    if (!source) return [];
    const parts = [];
    let current = '';
    let depth = 0;
    for (const character of source) {
      if (character === '(') depth += 1;
      if (character === ')') depth = Math.max(0, depth - 1);
      if ((character === ',' || character === ';') && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
      } else {
        current += character;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts.map(sentenceCase).filter(Boolean);
  }

  function countField(records, field) {
    const counts = new Map();
    let assessed = 0;
    for (const record of records) {
      const values = splitList(record[field]);
      if (!values.length) continue;
      assessed += 1;
      const seen = new Set();
      for (const value of values) {
        const key = normalize(value.replace(/[.]+$/, ''));
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const existing = counts.get(key);
        counts.set(key, { label: existing?.label || value, count: (existing?.count || 0) + 1 });
      }
    }
    const entries = [...counts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    return { entries, assessed };
  }

  function coverageLabel(assessed, total) {
    return total ? `${formatCount(assessed)} of ${formatCount(total)} records assessed` : 'No mapped records';
  }

  function appendEmpty(container, text = 'Not recorded for the mapped case studies.') {
    if (!container) return;
    container.replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = text;
    container.appendChild(message);
  }

  function renderBarList(container, entries, denominator, options = {}) {
    if (!container) return;
    container.replaceChildren();
    const limited = entries.slice(0, options.limit || entries.length);
    if (!limited.length) {
      appendEmpty(container, options.emptyText);
      return;
    }
    const max = Math.max(...limited.map(entry => entry.count), 1);
    for (const entry of limited) {
      const row = document.createElement('div');
      const header = document.createElement('div');
      const label = document.createElement('span');
      const value = document.createElement('strong');
      const track = document.createElement('div');
      const fill = document.createElement('div');
      row.className = 'bar-row';
      header.className = 'bar-row-header';
      label.textContent = entry.label || entry.type || 'Unclassified';
      const share = denominator ? ` · ${formatPercent(entry.count, denominator)}` : '';
      value.textContent = `${formatCount(entry.count)}${options.showShare === false ? '' : share}`;
      track.className = 'bar-track';
      fill.className = 'bar-fill';
      fill.style.width = `${Math.max(3, (entry.count / max) * 100)}%`;
      track.appendChild(fill);
      header.append(label, value);
      row.append(header, track);
      container.appendChild(row);
    }
  }

  function renderTagList(container, result, total) {
    if (!container) return;
    container.replaceChildren();
    if (!result.entries.length) {
      appendEmpty(container);
      return;
    }
    for (const entry of result.entries.slice(0, 8)) {
      const tag = document.createElement('span');
      tag.className = 'data-tag';
      tag.textContent = `${entry.label} · ${formatCount(entry.count)}`;
      container.appendChild(tag);
    }
    const note = document.createElement('small');
    note.className = 'tag-coverage';
    note.textContent = coverageLabel(result.assessed, total);
    container.appendChild(note);
  }

  function appendAnalysisCard(label, value, description) {
    if (!elements.analysisGrid) return;
    const card = document.createElement('div');
    const kicker = document.createElement('span');
    const heading = document.createElement('h3');
    const copy = document.createElement('p');
    card.className = 'analysis-card';
    kicker.textContent = label;
    heading.textContent = value;
    copy.textContent = description;
    card.append(kicker, heading, copy);
    elements.analysisGrid.appendChild(card);
  }

  function renderOverview() {
    if (!elements.overview) return;
    const summary = state.summary;
    if (!summary) {
      elements.overview.textContent = `${state.countryName} is presented here with baseline geographic and demographic attributes. Regime-shift records are still being calculated.`;
      return;
    }
    const total = Number(summary.total || 0);
    if (!total) {
      elements.overview.textContent = `No mapped Regime Shift Database case studies were assigned to ${state.countryName} using the current coordinate and boundary method. This does not establish that regime shifts are absent.`;
      return;
    }
    const topType = summary.types?.[0];
    const ecosystems = countField(summary.matchedPoints, 'ecosystem');
    const topEcosystem = ecosystems.entries[0];
    const typePhrase = topType ? `${topType.type} is the most frequently documented shift type` : 'No dominant shift type is recorded';
    const ecosystemPhrase = topEcosystem ? `${topEcosystem.label} is the most represented ecosystem context` : 'ecosystem context is not consistently recorded';
    elements.overview.textContent = `${state.countryName} has ${formatCount(total)} mapped database case stud${total === 1 ? 'y' : 'ies'} covering ${formatCount(summary.types.length)} regime-shift categor${summary.types.length === 1 ? 'y' : 'ies'}. ${typePhrase}, while ${ecosystemPhrase}.`;
  }

  function renderAnalysisSummary(summary) {
    const total = Number(summary.total || 0);
    const types = summary.types || [];
    const topType = types[0] || null;
    const ecosystems = countField(summary.matchedPoints, 'ecosystem');
    const topEcosystem = ecosystems.entries[0] || null;
    const evidenceAssessed = summary.matchedPoints.filter(record => record.evidenceSources || record.confidenceExistence || record.confidenceMechanism).length;
    elements.analysisGrid?.replaceChildren();
    appendAnalysisCard('Mapped case studies', formatCount(total), 'Unique cases within the selected boundary footprint.');
    appendAnalysisCard('Shift types', formatCount(types.length), 'Distinct regime-shift categories present.');
       appendAnalysisCard('Ecosystems represented', formatCount(ecosystems.entries.length), topEcosystem ? `Most common: ${topEcosystem.label} · ${formatCount(topEcosystem.count)} records.`: 'No ecosystem data is recorded.');
    appendAnalysisCard('Most documented shift', topType ? topType.type : 'None', topType ? `${formatCount(topType.count)} records · ${formatPercent(topType.count, total)} of mapped cases.` : 'No category is present.');

  }

  function renderComposition(summary) {
    const total = Number(summary.total || 0);
    const entries = (summary.types || []).map(entry => ({ label: entry.type, count: entry.count }));
    const visibleLimit = state.showAllTypes ? entries.length : INITIAL_TYPE_LIMIT;

    renderBarList(elements.typeChart, entries, total, {
      limit: visibleLimit,
      emptyText: 'No mapped regime-shift categories.'
    });

    if (elements.typeToggle) {
      const hasMore = entries.length > INITIAL_TYPE_LIMIT;
      elements.typeToggle.hidden = !hasMore;
      elements.typeToggle.textContent = state.showAllTypes ? 'Show less' : 'Show all';
      elements.typeToggle.setAttribute('aria-expanded', String(state.showAllTypes));

      if (hasMore && !state.typeToggleReady) {
        elements.typeToggle.addEventListener('click', () => {
          state.showAllTypes = !state.showAllTypes;
          renderComposition(state.summary);
        });
        state.typeToggleReady = true;
      }
    }

  }

  function renderSystems(summary) {
    const records = summary.matchedPoints || [];
    const ecosystems = countField(records, 'ecosystem');
    const drivers = countField(records, 'keyDirectDrivers');
    if (elements.ecosystemCoverage) elements.ecosystemCoverage.textContent = coverageLabel(ecosystems.assessed, records.length);
    if (elements.driverCoverage) elements.driverCoverage.textContent = coverageLabel(drivers.assessed, records.length);
    renderBarList(elements.ecosystemChart, ecosystems.entries, ecosystems.assessed, { limit: 10 });
    renderBarList(elements.driverChart, drivers.entries, drivers.assessed, { limit: 10 });
  }

  function renderImpacts(summary) {
    const records = summary.matchedPoints || [];
    renderTagList(elements.impactProcesses, countField(records, 'ecosystemProcesses'), records.length);
    renderTagList(elements.impactProvisioning, countField(records, 'provisioningServices'), records.length);
    renderTagList(elements.impactRegulating, countField(records, 'regulatingServices'), records.length);
    renderTagList(elements.impactCultural, countField(records, 'culturalServices'), records.length);
    renderTagList(elements.impactWellbeing, countField(records, 'humanWellBeing'), records.length);
    renderTagList(elements.impactSdgs, countField(records, 'sdgs'), records.length);
  }

  function recordYear(record) {
    if (recordYearCache.has(record)) return recordYearCache.get(record);
    const years = cleanDisplayText(record.yearOrDuration).match(/\b(?:18|19|20)\d{2}\b/g) || [];
    const valid = years.map(Number).filter(year => year >= 1800 && year <= new Date().getFullYear() + 1);
    const year = valid.length ? Math.min(...valid) : null;
    recordYearCache.set(record, year);
    return year;
  }

  function renderTimeline(records) {
    if (!elements.timelineChart) return;
    elements.timelineChart.replaceChildren();
    const years = records.map(recordYear).filter(Number.isFinite);
    if (!years.length) {
      if (elements.timelineStatus) elements.timelineStatus.textContent = 'No parseable calendar years are recorded for these cases.';
      appendEmpty(elements.timelineChart, 'No timeline data recorded.');
      return;
    }
    const decades = new Map();
    for (const year of years) {
      const decade = Math.floor(year / 10) * 10;
      decades.set(decade, (decades.get(decade) || 0) + 1);
    }
    const entries = [...decades.entries()].sort((a, b) => a[0] - b[0]);
    const max = Math.max(...entries.map(([, count]) => count), 1);
    if (elements.timelineStatus) {
      elements.timelineStatus.textContent = `${formatCount(years.length)} of ${formatCount(records.length)} records include a parseable year; coverage spans ${Math.min(...years)}–${Math.max(...years)}.`;
    }
    for (const [decade, count] of entries) {
      const item = document.createElement('div');
      const countLabel = document.createElement('strong');
      const bar = document.createElement('div');
      const label = document.createElement('span');
      item.className = 'timeline-item';
      countLabel.textContent = formatCount(count);
      bar.className = 'timeline-bar';
      bar.style.height = `${Math.max(8, (count / max) * 120)}px`;
      label.textContent = `${decade}s`;
      item.append(countLabel, bar, label);
      elements.timelineChart.appendChild(item);
    }
  }

  function renderDynamics(summary) {
    const records = summary.matchedPoints || [];
    renderTimeline(records);
    const timeScales = countField(records, 'timeScale');
    const reversibility = countField(records, 'reversibility');
    if (elements.timescaleCoverage) elements.timescaleCoverage.textContent = coverageLabel(timeScales.assessed, records.length);
    if (elements.reversibilityCoverage) elements.reversibilityCoverage.textContent = coverageLabel(reversibility.assessed, records.length);
    renderBarList(elements.timescaleChart, timeScales.entries, timeScales.assessed);
    renderBarList(elements.reversibilityChart, reversibility.entries, reversibility.assessed);
  }

  function renderEvidence(summary) {
    const records = summary.matchedPoints || [];
    const existence = countField(records, 'confidenceExistence');
    const mechanism = countField(records, 'confidenceMechanism');
    const sources = countField(records, 'evidenceSources');
    if (elements.existenceCoverage) elements.existenceCoverage.textContent = coverageLabel(existence.assessed, records.length);
    if (elements.mechanismCoverage) elements.mechanismCoverage.textContent = coverageLabel(mechanism.assessed, records.length);
    if (elements.sourcesCoverage) elements.sourcesCoverage.textContent = coverageLabel(sources.assessed, records.length);
    renderBarList(elements.existenceChart, existence.entries, existence.assessed);
    renderBarList(elements.mechanismChart, mechanism.entries, mechanism.assessed);
    renderBarList(elements.evidenceSourceChart, sources.entries, sources.assessed, { limit: 10 });
  }

  function extractLinks(record) {
    const links = [];
    const seen = new Set();
    function add(url, label) {
      let clean = String(url || '').trim().replace(/[),.;]+$/, '');
      if (!clean) return;
      if (/^10\.\d{4,9}\//i.test(clean)) clean = `https://doi.org/${clean}`;
      if (!/^https?:\/\//i.test(clean) || seen.has(clean)) return;
      seen.add(clean);
      links.push({ url: clean, label });
    }
    const linkText = cleanDisplayText(record.referenceLinks);
    const matches = linkText.match(/https?:\/\/[^\s<>"]+/gi) || [];
    matches.forEach((url, index) => add(url, `Source ${index + 1}`));
    const doiText = cleanDisplayText(record.doi);
    if (doiText) {
      const doiUrl = doiText.match(/https?:\/\/[^\s<>"]+/i)?.[0] || doiText.match(/10\.\d{4,9}\/[^\s,;]+/i)?.[0];
      if (doiUrl) add(doiUrl, 'DOI');
    }
    return links.slice(0, 6);
  }

  function appendDefinitionList(container, entries) {
    const usable = entries.filter(([, value]) => cleanDisplayText(value));
    if (!usable.length) return;
    const list = document.createElement('dl');
    list.className = 'case-meta';
    for (const [label, value] of usable) {
      const term = document.createElement('dt');
      const definition = document.createElement('dd');
      term.textContent = label;
      definition.textContent = cleanDisplayText(value);
      list.append(term, definition);
    }
    container.appendChild(list);
  }

  function appendCaseSection(container, title, body) {
    const text = truncate(body);
    if (!text) return;
    const section = document.createElement('section');
    const heading = document.createElement('h4');
    const copy = document.createElement('p');
    heading.textContent = title;
    copy.textContent = text;
    section.append(heading, copy);
    container.appendChild(section);
  }

  function renderCaseCard(record) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const titleBlock = document.createElement('span');
    const title = document.createElement('strong');
    const subtitle = document.createElement('small');
    const body = document.createElement('div');
    details.className = 'case-card';
    titleBlock.className = 'case-summary-copy';
    title.textContent = record.name || 'Unnamed case study';
    const year = recordYear(record);
    subtitle.textContent = [record.type, record.ecosystem, year || cleanDisplayText(record.yearOrDuration)].filter(Boolean).join(' · ');
    titleBlock.append(title, subtitle);
    summary.appendChild(titleBlock);
    body.className = 'case-card-body';
    appendDefinitionList(body, [
      ['Region', record.region],
      ['Countries listed in source', record.sourceCountries],
      ['Spatial scale', record.spatialScale],
      ['Time scale', record.timeScale],
      ['Reversibility', record.reversibility],
      ['Confidence in existence', record.confidenceExistence],
      ['Confidence in mechanism', record.confidenceMechanism]
    ]);
    appendCaseSection(body, 'Summary', record.summary);
    appendCaseSection(body, 'Drivers and causes', record.driversNarrative || record.keyDirectDrivers);
    appendCaseSection(body, 'How the shift worked', record.mechanismNarrative);
    appendCaseSection(body, 'Impacts', record.impactsNarrative || [record.ecosystemProcesses, record.provisioningServices, record.regulatingServices, record.culturalServices, record.humanWellBeing].filter(Boolean).join('; '));
    const links = extractLinks(record);
    if (links.length) {
      const linkSection = document.createElement('section');
      const heading = document.createElement('h4');
      const list = document.createElement('div');
      heading.textContent = 'References';
      list.className = 'case-links';
      for (const link of links) {
        const anchor = document.createElement('a');
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = link.label;
        list.appendChild(anchor);
      }
      linkSection.append(heading, list);
      body.appendChild(linkSection);
    } else if (cleanDisplayText(record.references)) {
      appendCaseSection(body, 'References', record.references);
    }
    details.append(summary, body);
    return details;
  }

  function sortedCaseRecords(records) {
    return [...records].sort((left, right) => {
      const yearDifference = (recordYear(right) || -Infinity) - (recordYear(left) || -Infinity);
      return yearDifference || String(left.name || '').localeCompare(String(right.name || ''));
    });
  }

  function filteredCaseRecords() {
    const records = sortedCaseRecords(state.summary?.matchedPoints || []);
    const query = normalize(elements.caseSearch?.value || '');
    const type = elements.caseTypeFilter?.value || '';
    return records.filter(record => {
      if (type && record.type !== type) return false;
      if (!query) return true;
      let haystack = recordSearchCache.get(record);
      if (!haystack) {
        haystack = normalize([
          record.name,
          record.type,
          record.ecosystem,
          record.region,
          record.sourceCountries,
          record.keyDirectDrivers,
          cleanDisplayText(record.summary)
        ].join(' '));
        recordSearchCache.set(record, haystack);
      }
      return haystack.includes(query);
    });
  }

  function updateCaseExplorer() {
    if (!elements.caseStudyList) return;
    const filtered = filteredCaseRecords();
    const visible = filtered.slice(0, state.caseLimit);
    elements.caseStudyList.replaceChildren(...visible.map(renderCaseCard));
    if (elements.caseResultsStatus) {
      elements.caseResultsStatus.textContent = filtered.length
        ? `Showing ${formatCount(visible.length)} of ${formatCount(filtered.length)} matching case stud${filtered.length === 1 ? 'y' : 'ies'}.`
        : 'No case studies match the current filters.';
    }
    if (elements.showMoreCases) {
      elements.showMoreCases.hidden = visible.length >= filtered.length;
      elements.showMoreCases.textContent = `Show ${formatCount(Math.min(CASE_PAGE_SIZE, filtered.length - visible.length))} more case studies`;
    }
    if (!filtered.length) appendEmpty(elements.caseStudyList, 'No case studies match the current filters.');
  }

  function renderCaseExplorer(summary) {
    if (!elements.caseTypeFilter) return;
    const currentValue = elements.caseTypeFilter.value;
    elements.caseTypeFilter.replaceChildren(new Option('All types', ''));
    for (const entry of summary.types || []) elements.caseTypeFilter.add(new Option(`${entry.type} (${formatCount(entry.count)})`, entry.type));
    if ([...elements.caseTypeFilter.options].some(option => option.value === currentValue)) elements.caseTypeFilter.value = currentValue;
    state.caseLimit = INITIAL_CASE_LIMIT;
    if (!state.caseListenersReady) {
      elements.caseSearch?.addEventListener('input', () => {
        state.caseLimit = INITIAL_CASE_LIMIT;
        updateCaseExplorer();
      });
      elements.caseTypeFilter?.addEventListener('change', () => {
        state.caseLimit = INITIAL_CASE_LIMIT;
        updateCaseExplorer();
      });
      elements.showMoreCases?.addEventListener('click', () => {
        state.caseLimit += CASE_PAGE_SIZE;
        updateCaseExplorer();
      });
      state.caseListenersReady = true;
    }
    updateCaseExplorer();
  }

  function tooltipContent(record) {
    const content = document.createElement('span');
    content.textContent = cleanDisplayText(record.name) || `Regime shift ${record.id}`;
    return content;
  }

  function setCountryMapInteractionEnabled(enabled) {
    if (!state.countryMap) return;
    const isCoarsePointer = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const shouldEnable = !isCoarsePointer || enabled;
    const handlers = [
      state.countryMap.dragging,
      state.countryMap.touchZoom,
      state.countryMap.doubleClickZoom,
      state.countryMap.boxZoom,
      state.countryMap.keyboard
    ].filter(Boolean);

    for (const handler of handlers) {
      if (shouldEnable) handler.enable();
      else handler.disable();
    }

    state.countryMap.scrollWheelZoom.disable();
    state.countryMap.getContainer().classList.toggle('map-interaction-enabled', shouldEnable);

    if (elements.countryMapInteractionToggle) {
      elements.countryMapInteractionToggle.hidden = !isCoarsePointer;
      elements.countryMapInteractionToggle.setAttribute('aria-pressed', String(shouldEnable));
      elements.countryMapInteractionToggle.textContent = shouldEnable ? 'Exit map' : 'Explore map';
    }
  }

  function showCountryMapError(message) {
    if (!elements.countryMap) return;
    elements.countryMap.classList.add('country-map-error');
    elements.countryMap.textContent = message;
    if (elements.countryMapStatus) elements.countryMapStatus.textContent = 'Map unavailable';
  }

  function renderCountryMap(summary, boundaryGeojson) {
    if (!elements.countryMap) return;
    if (!window.L) {
      showCountryMapError('The interactive map library could not be loaded. Check your connection and reload the page.');
      return;
    }

    const boundaryFeatures = window.RegimeData.countryBoundaryFeatures(boundaryGeojson, requestedCode);
    if (!boundaryFeatures.length) {
      showCountryMapError(`No map boundary was found for ${state.countryName}.`);
      return;
    }

    if (!state.countryMap) {
      state.countryMap = L.map(elements.countryMap, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      minZoom: 1,
      maxZoom: 12,
      maxBounds: TILE_WORLD_BOUNDS,
      maxBoundsViscosity: 1,
      worldCopyJump: false
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        bounds: TILE_WORLD_BOUNDS,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(state.countryMap);

      state.countryMap.createPane('countryBoundaryPane');
      state.countryMap.getPane('countryBoundaryPane').style.zIndex = '410';
      state.countryMap.createPane('countryRegimePointsPane');
      state.countryMap.getPane('countryRegimePointsPane').style.zIndex = '450';

      if (!state.countryMapInteractionReady && elements.countryMapInteractionToggle) {
        elements.countryMapInteractionToggle.addEventListener('click', () => {
          const isEnabled = elements.countryMapInteractionToggle.getAttribute('aria-pressed') === 'true';
          setCountryMapInteractionEnabled(!isEnabled);
        });
        state.countryMapInteractionReady = true;
      }
    }

    state.countryMapBoundaryLayer?.remove();
    state.countryMapPointsLayer?.remove();

    state.countryMapBoundaryLayer = L.geoJSON({
      type: 'FeatureCollection',
      features: boundaryFeatures
    }, {
      pane: 'countryBoundaryPane',
      interactive: false,
      style: {
        color: '#3366cc',
        weight: 1.4,
        opacity: 0.95,
        fillColor: '#3366cc',
        fillOpacity: 0.13
      }
    }).addTo(state.countryMap);

    

   state.countryMapPointsLayer = L.layerGroup().addTo(state.countryMap);

const normalPointStyle = {
  radius: 5,
  color: '#7a1f1f',
  weight: 1.2,
  opacity: 0.95,
  fillColor: '#b32424df',
  fillOpacity: 0.86
};

const hoverPointStyle = {
  radius: 5,
  color: '#202122',
  weight: 1.5,
  opacity: 1,
  fillColor: '#b32424',
  fillOpacity: 1
};

for (const record of summary.matchedPoints || []) {
  const marker = L.circleMarker(
    [record.latitude, record.longitude],
    {
      pane: 'countryRegimePointsPane',
      ...normalPointStyle
    }
  );

  marker.on('mouseover', () => {
    marker.setStyle(hoverPointStyle);
    marker.bringToFront();
  });

  marker.on('mouseout', () => {
    marker.setStyle(normalPointStyle);
  });

  marker.bindTooltip(tooltipContent(record), {
    className: 'case-map-tooltip',
    direction: 'top',
    offset: [0, -5],
    opacity: 1,
    sticky: true
  });

  marker.addTo(state.countryMapPointsLayer);
}

    const bounds = state.countryMapBoundaryLayer.getBounds();
    if (bounds.isValid()) {
      state.countryMap.fitBounds(bounds, { padding: [12, 12], maxZoom: 12 });
    } else if (summary.matchedPoints?.length) {
      const pointBounds = L.latLngBounds(summary.matchedPoints.map(record => [record.latitude, record.longitude]));
      state.countryMap.fitBounds(pointBounds, { padding: [28, 28], maxZoom: 12 });
    } else {
      state.countryMap.setView([20, 0], 4);
    }

    const total = Number(summary.total || 0);
    if (elements.countryMapPointCount) elements.countryMapPointCount.textContent = formatCount(total);
    if (elements.countryMapStatus) {
      elements.countryMapStatus.textContent = total
        ? `${formatCount(total)} case stud${total === 1 ? 'y' : 'ies'} inside the selected boundary.`
        : 'No mapped case studies fall inside the selected boundary.';
    }

    setCountryMapInteractionEnabled(false);
    window.requestAnimationFrame(() => state.countryMap.invalidateSize({ pan: false }));
  }

  function renderDashboard(summary, boundaryGeojson) {
    state.summary = summary;
    renderOverview();
    renderCountryMap(summary, boundaryGeojson);
    renderAnalysisSummary(summary);
    renderComposition(summary);
    renderSystems(summary);
    renderImpacts(summary);
    renderDynamics(summary);
    renderEvidence(summary);
    renderCaseExplorer(summary);
  }

  async function loadRegimeAnalysis() {
    try {
      if (!requestedCode) throw new Error('No country code was supplied.');
      if (!window.RegimeData) throw new Error('The shared regime-data module is unavailable.');
      const [boundaryResponse, dataset] = await Promise.all([
        fetch(BOUNDARY_GEOJSON_URL, { cache: 'no-cache' }),
        window.RegimeData.loadCsv(REGIME_DATABASE_URL)
      ]);
      if (!boundaryResponse.ok) throw new Error(`Boundary data returned ${boundaryResponse.status}`);
      const boundaryGeojson = await boundaryResponse.json();
      const summary = window.RegimeData.summarizeCountry(dataset.points, boundaryGeojson, requestedCode);
      if (!summary.boundaryFeatureCount) throw new Error(`No boundary features were found for ${requestedCode}.`);
      renderDashboard(summary, boundaryGeojson);
    } catch (error) {
      console.error('Unable to calculate regime-shift statistics:', error);
      [elements.typeChart, elements.ecosystemChart, elements.driverChart, elements.timelineChart, elements.caseStudyList].forEach(container => appendEmpty(container, 'Data unavailable.'));
      showCountryMapError('Country boundary or regime-shift data could not be loaded. Run the site through a local web server and reload.');
    }
  }

  function isRequestedCountry(feature) {
    const properties = feature.properties || {};
    const codes = [properties.ADM0_A3, properties.ISO_A3_EH, properties.ISO_A3, properties.SOV_A3]
      .filter(Boolean)
      .map(code => String(code).toUpperCase());
    return (requestedCode && codes.includes(requestedCode)) || (requestedName && normalize(countryName(properties)) === normalize(requestedName));
  }

  function worldBankRows(payload) {
  return Array.isArray(payload) && Array.isArray(payload[1])
    ? payload[1]
    : [];
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API request returned ${response.status}`);
  }

  return response.json();
}

async function fetchCountryFromApi(code) {
  const countryCode = encodeURIComponent(code);
  const indicatorCodes = Object.values(WORLD_BANK_INDICATORS).join(';');

  const countryUrl =
    `${WORLD_BANK_API_URL}/country/${countryCode}?format=json`;

  const statisticsUrl =
    `${WORLD_BANK_API_URL}/country/${countryCode}` +
    `/indicator/${indicatorCodes}` +
    `?source=2&format=json&mrnev=1&per_page=10`;

  const [countryPayload, statisticsPayload] = await Promise.all([
    fetchJson(countryUrl),
    fetchJson(statisticsUrl)
  ]);

  const country = worldBankRows(countryPayload)[0];

  if (!country) {
    throw new Error(`No API country record was found for ${code}.`);
  }

  const statistics = new Map(
    worldBankRows(statisticsPayload)
      .filter(record => record.value !== null)
      .map(record => [record.indicator.id, record])
  );

  const population = statistics.get(
    WORLD_BANK_INDICATORS.population
  );

  const gdp = statistics.get(
    WORLD_BANK_INDICATORS.gdp
  );

  const area = statistics.get(
    WORLD_BANK_INDICATORS.area
  );

  return {
    name: country.name || requestedName || code,
    formalName: '',
    code: country.id || code,
    iso2: country.iso2Code || '',

    population: population
      ? Number(population.value)
      : null,

    populationYear: population
      ? Number(population.date)
      : null,


    areaSquareMetres: area
      ? Number(area.value) * 1_000_000
      : null,


    gdp: gdp
      ? Number(gdp.value) / 1_000_000
      : null,

    gdpYear: gdp
      ? Number(gdp.date)
      : null
  };
}
async function fetchCountryFallback() {
  const response = await fetch(COUNTRY_GEOJSON_URL);

  if (!response.ok) {
    throw new Error(`Country GeoJSON returned ${response.status}`);
  }

  const geojson = await response.json();
  const feature = geojson.features.find(isRequestedCountry);

  if (!feature) {
    throw new Error(`No Natural Earth record found for ${requestedCode}.`);
  }

  return toCountryData(feature);
}
  async function loadCountry() {
  const cachedEntry = getCachedCountry();
  const cachedCountry = cachedEntry?.data || null;

  let fallbackCountry = null;

  // 1. Render cache immediately if available
  if (cachedCountry) {
    renderCountry(cachedCountry);
  } else {
    // 2. Otherwise use Natural Earth immediately
    try {
      fallbackCountry = await fetchCountryFallback();
      renderCountry(fallbackCountry);
    } catch (error) {
      console.warn('Natural Earth fallback unavailable:', error);

      renderCountry({
        name: requestedName || requestedCode || 'Country profile',
        code: requestedCode || '—'
      });
    }
  }

  // 3. Try to improve/refresh it with World Bank data
  try {
    if (!requestedCode) {
      throw new Error('No country code was supplied.');
    }

    const apiCountry = await fetchCountryFromApi(requestedCode);

    // Keep fallback values if the API is missing a particular field
    const country = {
      ...(fallbackCountry || cachedCountry || {}),
      ...apiCountry,

      population:
        apiCountry.population ??
        fallbackCountry?.population ??
        cachedCountry?.population ??
        null,

      populationYear:
        apiCountry.populationYear ??
        fallbackCountry?.populationYear ??
        cachedCountry?.populationYear ??
        null,

      gdp:
        apiCountry.gdp ??
        fallbackCountry?.gdp ??
        cachedCountry?.gdp ??
        null,

      gdpYear:
        apiCountry.gdpYear ??
        fallbackCountry?.gdpYear ??
        cachedCountry?.gdpYear ??
        null,

      areaSquareMetres:
        apiCountry.areaSquareMetres ??
        fallbackCountry?.areaSquareMetres ??
        cachedCountry?.areaSquareMetres ??
        null
    };

    renderCountry(country);

    try {
      sessionStorage.setItem(
        `${COUNTRY_API_CACHE_PREFIX}${requestedCode}`,
        JSON.stringify({
          cachedAt: Date.now(),
          data: country
        })
      );
    } catch (error) {
      console.warn('Country API result could not be cached:', error);
    }

  } catch (error) {
    console.warn('World Bank statistics unavailable:', error);

    // This is no longer fatal, because Natural Earth/cache
    // should already be displayed.
    if (!fallbackCountry && !cachedCountry) {
      showError(
        'Some country statistics could not be loaded.'
      );
    }
  }
}
  loadCountry();
  loadRegimeAnalysis();
})();

