(() => {
  'use strict';

  const REQUIRED_COLUMNS = [
    'id',
    'case_study_name',
    'type',
    'regime_shift_type_other',
    'ecosystem_type',
    'location_region',
    'location_countries',
    'long',
    'lat'
  ];

  const OPTIONAL_COLUMNS = [
    'summary',
    'land_uses',
    'spatial_scale',
    'location_continent_or_ocean',
    'key_direct_drivers',
    'impacts_ecosystem_processes',
    'impacts_provisioning_services',
    'impacts_regulating_services',
    'impacts_cultural_services',
    'impacts_human_well_being',
    'impacts_sdg',
    'time_scale',
    'reversibility',
    'sources_of_evidence',
    'confidence_of_existence',
    'confidence_of_mechanism',
    'year_or_duration',
    'drivers_and_causes',
    'how_regime_shift_worked',
    'impacts_on_ecosystem_services_and_human_well_being',
    'references',
    'reference_links',
    'doi'
  ];

  const SELECTED_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

  function cleanText(value) {
    const text = String(value ?? '').trim();
    return text.toUpperCase() === 'NA' ? '' : text;
  }

  function cleanCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return code && code !== '-99' ? code : '';
  }

  function primaryCountryCode(properties = {}) {
    return cleanCode(properties.ISO_SOV1) ||
      cleanCode(properties.ISO_TER1) ||
      (properties.UNION === 'Antarctica' ? 'ATA' : '');
  }

  function allCountryCodes(properties = {}) {
    const codes = [properties.ISO_SOV1, properties.ISO_SOV2, properties.ISO_SOV3]
      .map(cleanCode)
      .filter(Boolean);

    const primary = primaryCountryCode(properties);
    if (primary) codes.unshift(primary);
    return [...new Set(codes)];
  }

  function parseCsvText(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const records = [];
    const metadata = {
      totalRecords: 0,
      validCoordinateRecords: 0,
      invalidCoordinateRecords: 0
    };

    let headers = null;
    let selectedIndexes = null;
    let row = [];
    let field = '';
    let inQuotes = false;
    let rowNumber = 1;

    function finishField() {
      row.push(field);
      field = '';
    }

    function finishRow() {
      if (!headers) {
        headers = row.map(header => String(header || '').trim());
        const missing = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
        if (missing.length) {
          throw new Error(`CSV is missing required columns: ${missing.join(', ')}`);
        }

        selectedIndexes = Object.fromEntries(
          SELECTED_COLUMNS.map(column => [column, headers.indexOf(column)])
        );
      } else if (row.some(value => value !== '')) {
        metadata.totalRecords += 1;
        const value = column => {
          const index = selectedIndexes[column];
          return index >= 0 ? (row[index] ?? '') : '';
        };
        const longitude = Number(value('long'));
        const latitude = Number(value('lat'));

        if (
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude) ||
          longitude < -180 ||
          longitude > 180 ||
          latitude < -90 ||
          latitude > 90
        ) {
          metadata.invalidCoordinateRecords += 1;
        } else {
          const rawType = cleanText(value('type'));
          const otherType = cleanText(value('regime_shift_type_other'));
          const type = rawType.toLowerCase() === 'unclassified'
            ? (otherType || 'Unclassified')
            : (rawType || 'Unspecified');
          const id = cleanText(value('id')) || `row-${rowNumber}`;

          records.push({
            id,
            name: cleanText(value('case_study_name')) || `Regime shift ${id}`,
            type,
            summary: cleanText(value('summary')),
            ecosystem: cleanText(value('ecosystem_type')),
            landUses: cleanText(value('land_uses')),
            spatialScale: cleanText(value('spatial_scale')),
            continentOrOcean: cleanText(value('location_continent_or_ocean')),
            region: cleanText(value('location_region')),
            sourceCountries: cleanText(value('location_countries')),
            keyDirectDrivers: cleanText(value('key_direct_drivers')),
            ecosystemProcesses: cleanText(value('impacts_ecosystem_processes')),
            provisioningServices: cleanText(value('impacts_provisioning_services')),
            regulatingServices: cleanText(value('impacts_regulating_services')),
            culturalServices: cleanText(value('impacts_cultural_services')),
            humanWellBeing: cleanText(value('impacts_human_well_being')),
            sdgs: cleanText(value('impacts_sdg')),
            timeScale: cleanText(value('time_scale')),
            reversibility: cleanText(value('reversibility')),
            evidenceSources: cleanText(value('sources_of_evidence')),
            confidenceExistence: cleanText(value('confidence_of_existence')),
            confidenceMechanism: cleanText(value('confidence_of_mechanism')),
            yearOrDuration: cleanText(value('year_or_duration')),
            driversNarrative: cleanText(value('drivers_and_causes')),
            mechanismNarrative: cleanText(value('how_regime_shift_worked')),
            impactsNarrative: cleanText(value('impacts_on_ecosystem_services_and_human_well_being')),
            references: cleanText(value('references')),
            referenceLinks: cleanText(value('reference_links')),
            doi: cleanText(value('doi')),
            longitude,
            latitude
          });
          metadata.validCoordinateRecords += 1;
        }
      }

      row = [];
      rowNumber += 1;
    }

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];

      if (inQuotes) {
        if (character === '"') {
          if (source[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"' && field === '') {
        inQuotes = true;
      } else if (character === ',') {
        finishField();
      } else if (character === '\n') {
        finishField();
        finishRow();
      } else if (character === '\r') {
        if (source[index + 1] !== '\n') {
          finishField();
          finishRow();
        }
      } else {
        field += character;
      }
    }

    if (field !== '' || row.length) {
      finishField();
      finishRow();
    }

    return { points: records, metadata };
  }

  async function loadCsv(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Regime-shift database returned ${response.status}`);

    const parsed = parseCsvText(await response.text());
    parsed.metadata.source = url;
    return parsed;
  }

  function toFeatureCollection(points, metadata = {}) {
    return {
      type: 'FeatureCollection',
      metadata,
      features: points.map(point => ({
        type: 'Feature',
        properties: {
          id: point.id,
          name: point.name,
          type: point.type,
          ...(point.ecosystem ? { ecosystem: point.ecosystem } : {}),
          ...(point.region ? { region: point.region } : {}),
          ...(point.sourceCountries ? { source_countries: point.sourceCountries } : {})
        },
        geometry: {
          type: 'Point',
          coordinates: [point.longitude, point.latitude]
        }
      }))
    };
  }

  function pointOnSegment(point, start, end) {
    const [x, y] = point;
    const [x1, y1] = start;
    const [x2, y2] = end;
    const epsilon = 1e-10;
    const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
    if (Math.abs(cross) > epsilon) return false;

    return x >= Math.min(x1, x2) - epsilon &&
      x <= Math.max(x1, x2) + epsilon &&
      y >= Math.min(y1, y2) - epsilon &&
      y <= Math.max(y1, y2) + epsilon;
  }

  function pointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;

    const [x, y] = point;
    let inside = false;

    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const currentPoint = ring[index];
      const previousPoint = ring[previous];

      if (pointOnSegment(point, previousPoint, currentPoint)) return true;

      const [currentX, currentY] = currentPoint;
      const [previousX, previousY] = previousPoint;
      const crossesLatitude = (currentY > y) !== (previousY > y);

      if (crossesLatitude) {
        const intersectionX = (previousX - currentX) * (y - currentY) /
          (previousY - currentY) + currentX;
        if (x < intersectionX) inside = !inside;
      }
    }

    return inside;
  }

  function pointInPolygon(point, polygonCoordinates) {
    if (!Array.isArray(polygonCoordinates) || !polygonCoordinates.length) return false;
    if (!pointInRing(point, polygonCoordinates[0])) return false;

    for (let index = 1; index < polygonCoordinates.length; index += 1) {
      if (pointInRing(point, polygonCoordinates[index])) return false;
    }

    return true;
  }

  function pointInGeometry(point, geometry) {
    if (!geometry) return false;

    if (geometry.type === 'Polygon') {
      return pointInPolygon(point, geometry.coordinates);
    }

    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.some(polygon => pointInPolygon(point, polygon));
    }

    return false;
  }

  function geometryBounds(geometry) {
    if (!geometry?.coordinates) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    function visit(coordinates) {
      if (!Array.isArray(coordinates)) return;
      if (
        coordinates.length >= 2 &&
        Number.isFinite(Number(coordinates[0])) &&
        Number.isFinite(Number(coordinates[1]))
      ) {
        const x = Number(coordinates[0]);
        const y = Number(coordinates[1]);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        return;
      }

      for (const child of coordinates) visit(child);
    }

    visit(geometry.coordinates);
    return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
  }

  function pointInBounds(point, bounds) {
    return !bounds || (
      point[0] >= bounds[0] &&
      point[0] <= bounds[2] &&
      point[1] >= bounds[1] &&
      point[1] <= bounds[3]
    );
  }

  function countryBoundaryFeatures(boundaryGeojson, countryCode) {
    const code = cleanCode(countryCode);
    return (boundaryGeojson?.features || []).filter(feature =>
      allCountryCodes(feature.properties || {}).includes(code)
    );
  }

  function summarizeCountry(points, boundaryGeojson, countryCode) {
    const boundaryFeatures = countryBoundaryFeatures(boundaryGeojson, countryCode);
    const geometries = boundaryFeatures
      .filter(feature => feature.geometry)
      .map(feature => ({
        geometry: feature.geometry,
        bounds: geometryBounds(feature.geometry)
      }));

    const countedIds = new Set();
    const typeCounts = new Map();
    const matchedPoints = [];

    for (const record of points || []) {
      const point = [record.longitude, record.latitude];
      const isInside = geometries.some(item =>
        pointInBounds(point, item.bounds) && pointInGeometry(point, item.geometry)
      );

      if (!isInside || countedIds.has(record.id)) continue;

      countedIds.add(record.id);
      matchedPoints.push(record);
      typeCounts.set(record.type, (typeCounts.get(record.type) || 0) + 1);
    }

    const types = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) =>
        right.count - left.count || left.type.localeCompare(right.type, undefined, { sensitivity: 'base' })
      );

    return {
      total: matchedPoints.length,
      types,
      matchedPoints,
      boundaryFeatureCount: boundaryFeatures.length
    };
  }

  window.RegimeData = Object.freeze({
    allCountryCodes,
    cleanCode,
    countryBoundaryFeatures,
    loadCsv,
    parseCsvText,
    pointInGeometry,
    summarizeCountry,
    toFeatureCollection
  });
})();
