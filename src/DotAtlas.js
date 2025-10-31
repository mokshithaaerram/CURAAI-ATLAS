import React, { useEffect, useState, useMemo, useRef } from "react";
import DotModal from "./DotModal";
import "./styles.css";

const dataFiles = [
  "dentistry_shard_0.json",
  "dermatology_shard_0.json",
  "diabetes_shard_0.json",
  "diabetes_shard_1.json",
  "general_medicine_shard_0.json",
  "general_medicine_shard_1.json",
  "general_medicine_shard_2.json",
  "general_medicine_shard_3.json",
  "general_medicine_shard_4.json",
  "neurology_shard_0.json",
  "dentistry_merged.json",
  "dermatology_merged.json",
  "diabetes_obesity_pcod_hypertension.json",
  "maternal_menstrual_immunization.json",
  "neurology_merged.json",
  "sanitation_schemes_immunization.json"
];

const specialtyColors = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
];

function randn_bm(mean, stddev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stddev + mean;
}

function nonOverlappingGaussian(numDots, center, spread, radius, color, zoomLevel = 1) {
  const effectiveSpread = Math.max(12, spread * zoomLevel); // ensure a min spread
  const minDist2 = Math.pow((radius * 2 + 1), 2);
  const placed = [];
  let tries = 0, maxTries = 1000 * Math.max(1, Math.floor(numDots / 10));

  for (let i = 0; i < numDots && tries < maxTries; ++i) {
    let safe = false, x, y;
    let localTries = 0;
    do {
      x = randn_bm(center.x, effectiveSpread);
      y = randn_bm(center.y, effectiveSpread);
      safe = true;
      for (let j = 0; j < placed.length; ++j) {
        const dx = x - placed[j].x, dy = y - placed[j].y;
        if (dx * dx + dy * dy < minDist2) { safe = false; break; }
      }
      localTries++;
      tries++;
      if (localTries > 40) break;
    } while (!safe);
    placed.push({ x, y, color });
  }
  return placed;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function DotAtlas() {
  const [dots, setDots] = useState([]);
  const [baseDots, setBaseDots] = useState([]); // Store original dot records
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedDot, setSelectedDot] = useState(null);
  const [specialties, setSpecialties] = useState([]);
  const [search, setSearch] = useState('');
  const [focusSpec, setFocusSpec] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchMode, setSearchMode] = useState('specialty');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const svgRef = useRef(null);

  const canvasW = 1000, canvasH = 700;
  const clusterOuterRadiusBase = 230;
  const clusterSpread = 75;
  const dotRadius = 4;
  const padding = 8; // keep dots from touching edge

  // Filtered dots for search highlight
  const filteredDots = useMemo(() => {
    if (!search.trim() && !focusSpec) return dots;
    const searchTerm = search.toLowerCase();
    if (searchMode === 'specialty') {
      return dots.filter(dot =>
        dot.specialty.toLowerCase().includes(searchTerm) ||
        (focusSpec && dot.specialty === focusSpec)
      );
    } else {
      return dots.filter(dot =>
        (dot.question || '').toLowerCase().includes(searchTerm) ||
        (dot.answer || '').toLowerCase().includes(searchTerm)
      );
    }
  }, [dots, search, focusSpec, searchMode]);

  // Recompute dot positions when zoomLevel, baseDots, specialties or offset changes
  useEffect(() => {
    if (baseDots.length === 0 || specialties.length === 0) return;

    const clusterOuterRadius = clusterOuterRadiusBase * Math.max(0.6, zoomLevel); // centers move with zoom
    const centers = specialties.map((_, i, arr) => {
      const angle = 2 * Math.PI * i / arr.length;
      return {
        x: canvasW / 2 + Math.cos(angle) * clusterOuterRadius + offset.x,
        y: canvasH / 2 + Math.sin(angle) * clusterOuterRadius + offset.y
      };
    });

    const specialtyGroups = {};
    baseDots.forEach(dot => {
      if (!specialtyGroups[dot.specialty]) specialtyGroups[dot.specialty] = [];
      specialtyGroups[dot.specialty].push(dot);
    });

    const updatedDots = [];

    specialties.forEach((spec, sIdx) => {
      const cluster = specialtyGroups[spec] || [];
      const center = centers[sIdx] || { x: canvasW / 2 + offset.x, y: canvasH / 2 + offset.y };

      const positions = nonOverlappingGaussian(
        cluster.length,
        center,
        clusterSpread,
        dotRadius,
        cluster[0]?.color,
        zoomLevel
      );

      cluster.forEach((dot, k) => {
        // clamp to canvas + padding so all dots visible
        const basePos = positions[k] || center;
        const cx = clamp(basePos.x, padding, canvasW - padding);
        const cy = clamp(basePos.y, padding, canvasH - padding);
        updatedDots.push({
          ...dot,
          x: cx,
          y: cy,
          radius: Math.max(2, Math.min(zoomLevel * dotRadius, 12)),
          id: dot.id
        });
      });
    });

    setDots(updatedDots);
  }, [zoomLevel, baseDots, specialties, offset]);

  // Load data files, build specialties excluding "Unknown"
  useEffect(() => {
    setIsLoading(true);
    Promise.all(
      dataFiles.map(file =>
        fetch(process.env.PUBLIC_URL + "/" + file)
          .then(res => {
            if (!res.ok) throw new Error(`Failed to load ${file}`);
            return res.json();
          })
          .catch(error => {
            console.error(`Error loading ${file}:`, error);
            return [];
          })
      )
    ).then(list => {
      const qaPairs = [].concat(...list);
      const uniqueSpecs = Array.from(new Set(qaPairs.map(q => (q.specialty || "Unknown"))))
        .filter(s => s && s.toLowerCase() !== 'unknown'); // REMOVE Unknown

      setSpecialties(uniqueSpecs);

      const currCenters = uniqueSpecs.length > 0
        ? uniqueSpecs.map((_, i, arr) => {
          const angle = 2 * Math.PI * i / arr.length;
          return {
            x: canvasW / 2 + Math.cos(angle) * clusterOuterRadiusBase,
            y: canvasH / 2 + Math.sin(angle) * clusterOuterRadiusBase
          };
        })
        : [];

      const currColorMap = {};
      uniqueSpecs.forEach((spec, i) => {
        currColorMap[spec] = specialtyColors[i % specialtyColors.length];
      });

      let arrangedDots = [];
      uniqueSpecs.forEach((spec, sIdx) => {
        const cluster = qaPairs.filter(q => q.specialty === spec);
        const positions = nonOverlappingGaussian(
          cluster.length,
          currCenters[sIdx],
          clusterSpread,
          dotRadius,
          currColorMap[spec],
          1
        );

        for (let k = 0; k < cluster.length; ++k) {
          const rawX = positions[k]?.x ?? currCenters[sIdx].x;
          const rawY = positions[k]?.y ?? currCenters[sIdx].y;
          const cx = clamp(rawX, padding, canvasW - padding);
          const cy = clamp(rawY, padding, canvasH - padding);

          arrangedDots.push({
            ...cluster[k],
            specialty: spec,
            x: cx,
            y: cy,
            color: currColorMap[spec],
            radius: dotRadius,
            id: `${spec}-${k}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
          });
        }
      });

      setBaseDots(arrangedDots);
      setDots(arrangedDots);
      setIsLoading(false);
    });
  }, []);

  const centers = specialties.map((_, i, arr) => {
    const angle = 2 * Math.PI * i / arr.length;
    const clusterOuterRadius = clusterOuterRadiusBase * Math.max(0.6, zoomLevel);
    return {
      x: canvasW / 2 + Math.cos(angle) * clusterOuterRadius + offset.x,
      y: canvasH / 2 + Math.sin(angle) * clusterOuterRadius + offset.y
    };
  });

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => { setIsDragging(false); };

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoomLevel(prev => clamp(prev + delta, 0.5, 3));
  };

  const handleDotClick = (idx) => {
    setSelectedDot(dots[idx]);
  };

  const handleSearchSubmit = () => {
    if (search.length > 0) {
      const found = specialties.find(s => s.toLowerCase().includes(search.toLowerCase()));
      if (found) {
        setFocusSpec(found);
        setSearch(found);
      }
    }
  };
  const clearSearch = () => { setSearch(''); setFocusSpec(''); };

  // tooltip position calculation (position absolute inside atlas-svg-container)
  const getTooltipPos = (dot) => {
    if (!dot) return { left: 0, top: 0 };
    const containerRect = svgRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const left = dot.x + containerRect.left + 10; // offset a bit
    const top = dot.y + containerRect.top - 10;
    // We place it using svg container coords later; but we’ll render tooltip using absolute positions relative to atlas container
    return { left: dot.x + 12, top: dot.y - 12 };
  };

  return (
    <div className="atlas-root">
     

      {/* Enhanced Search Header */}
      <div className="search-header">
        <div className="search-container">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder={
                searchMode === 'specialty'
                  ? "Search specialties..."
                  : "Search questions & answers..."
              }
              value={search}
              className="search-input"
              onChange={e => { setSearch(e.target.value); setFocusSpec(''); }}
              onKeyDown={e => { if (e.key === "Enter") handleSearchSubmit(); }}
              list="specs"
            />
            {search && (
              <button className="clear-search-btn" onClick={clearSearch}>✕</button>
            )}
          </div>

          <datalist id="specs">
            {specialties.map(spec => <option key={spec} value={spec} />)}
          </datalist>

          <div className="search-mode-toggle">
            <button
              className={`mode-btn ${searchMode === 'specialty' ? 'active' : ''}`}
              onClick={() => setSearchMode('specialty')}
            >
              Specialties
            </button>
            <button
              className={`mode-btn ${searchMode === 'question' ? 'active' : ''}`}
              onClick={() => setSearchMode('question')}
            >
              Q&A
            </button>
          </div>

          <button
            className="search-submit-btn"
            onClick={handleSearchSubmit}
            disabled={!search.trim()}
          >
            Search
          </button>
        </div>

        {/* Search Results Info */}
        {(search || focusSpec) && (
          <div className="search-results-info">
            Showing {filteredDots.length} of {dots.length} items
            {focusSpec && (
              <span className="active-filter">
                • Filtered by: <strong>{focusSpec}</strong>
                <button onClick={clearSearch} className="remove-filter">✕</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Atlas Container */}
      <div className="atlas-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading medical knowledge atlas...</p>
          </div>
        ) : (
          <div
            className="atlas-svg-container"
            style={{ width: canvasW, height: canvasH }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <svg
              ref={svgRef}
              width={canvasW}
              height={canvasH}
              className="atlas-svg"
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              {/* Background circles for clusters */}
              {specialties.map((spec, sIdx) => (
                <circle
                  key={`bg-${spec}`}
                  cx={centers[sIdx]?.x ?? canvasW / 2}
                  cy={centers[sIdx]?.y ?? canvasH / 2}
                  r={clusterSpread * 2 * zoomLevel}
                  fill={specialtyColors[sIdx % specialtyColors.length]}
                  fillOpacity={0.05}
                  stroke={specialtyColors[sIdx % specialtyColors.length]}
                  strokeOpacity={0.18}
                  strokeWidth={1}
                />
              ))}

              {/* Dots */}
              {dots.map((dot, idx) => {
                const isFiltered = filteredDots.includes(dot);
                const isHighlighted = hoveredIdx === idx || selectedDot?.id === dot.id;

                return (
                  <circle
                    key={dot.id}
                    cx={dot.x}
                    cy={dot.y}
                    r={isHighlighted ? dot.radius + 2 : dot.radius}
                    fill={dot.color}
                    stroke="#fff"
                    strokeWidth={isHighlighted ? 3 : 1}
                    opacity={isFiltered ? 1 : 0.18}
                    className="knowledge-dot"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => handleDotClick(idx)}
                  />
                );
              })}

              {/* Specialty Labels */}
              {specialties.map((spec, sIdx) => (
                <g key={`label-${spec}`}>
                  <circle
                    cx={centers[sIdx]?.x ?? canvasW / 2}
                    cy={(centers[sIdx]?.y ?? canvasH / 2) - 45}
                    r={15}
                    fill={specialtyColors[sIdx % specialtyColors.length]}
                    fillOpacity={0.95}
                  />
                  <text
                    x={centers[sIdx]?.x ?? canvasW / 2}
                    y={(centers[sIdx]?.y ?? canvasH / 2) - 45}
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight="bold"
                    fill="#fff"
                    dy="0.35em"
                  >
                    {spec.charAt(0)}
                  </text>
                  <text
                    x={centers[sIdx]?.x ?? canvasW / 2}
                    y={(centers[sIdx]?.y ?? canvasH / 2) - 20}
                    textAnchor="middle"
                    fontSize={16}
                    fontWeight="600"
                    fill="#2c3e50"
                    className="specialty-label"
                  >
                    {spec}
                  </text>
                </g>
              ))}
            </svg>

            {/* Tooltip (inline neat tooltip) */}
            {hoveredIdx !== null && dots[hoveredIdx] && (
              <div
                className="dot-tooltip"
                style={{
                  left: getTooltipPos(dots[hoveredIdx]).left,
                  top: getTooltipPos(dots[hoveredIdx]).top
                }}
              >
                <div className="tooltip-header">
                  <strong className="tooltip-specialty">{dots[hoveredIdx].specialty}</strong>
                </div>
                <div className="tooltip-body">
                  <div className="tooltip-q"><strong>Q:</strong> {dots[hoveredIdx].question || '—'}</div>
                  <div className="tooltip-a"><strong>A:</strong> {dots[hoveredIdx].answer || '—'}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal for detailed view */}
      <DotModal
        open={!!selectedDot}
        question={selectedDot?.question}
        answer={selectedDot?.answer}
        specialty={selectedDot?.specialty}
        onClose={() => setSelectedDot(null)}
      />

      {/* Legend */}
      <div className="atlas-legend">
        <div className="legend-title">Medical Specialties</div>
        <div className="legend-items">
          {specialties.map((spec, idx) => (
            <div key={spec} className="legend-item">
              <span
                className="legend-color"
                style={{ backgroundColor: specialtyColors[idx % specialtyColors.length] }}
              ></span>
              <span className="legend-label">{spec}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DotAtlas;
