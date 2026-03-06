import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "./Admin.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

const LEG_COLORS = {
  walk: "#10b981",
  transfer: "#10b981",
  trip: "#4f6ef7",
};

function JourneyMap({ legs }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!legs || legs.length === 0) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
      dragging: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "\u00a9 OpenStreetMap contributors",
    }).addTo(map);

    const allBounds = L.latLngBounds([]);
    let firstPoint = null;
    let lastPoint = null;

    for (const leg of legs) {
      let coords = [];
      if (leg.path && leg.path.length > 0) {
        coords = leg.path;
      } else if (leg.type === "trip" && leg.from?.coord && leg.to?.coord) {
        coords = [leg.from.coord, leg.to.coord];
      }
      if (coords.length < 2) continue;

      const color = LEG_COLORS[leg.type] || "#4f6ef7";
      const isDashed = leg.type === "walk" || leg.type === "transfer";

      const polyline = L.polyline(coords, {
        color,
        weight: 5,
        opacity: 0.85,
        dashArray: isDashed ? "8 8" : null,
      }).addTo(map);

      allBounds.extend(polyline.getBounds());
      if (!firstPoint) firstPoint = coords[0];
      lastPoint = coords[coords.length - 1];
    }

    if (firstPoint) {
      L.circleMarker(firstPoint, {
        radius: 8,
        color: "#fff",
        fillColor: "#10b981",
        fillOpacity: 1,
        weight: 3,
      }).addTo(map);
    }
    if (lastPoint) {
      L.circleMarker(lastPoint, {
        radius: 8,
        color: "#fff",
        fillColor: "#ef4444",
        fillOpacity: 1,
        weight: 3,
      }).addTo(map);
    }

    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [30, 30] });
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [legs]);

  return <div ref={mapRef} className="admin-journey-map" />;
}

function AdminMap({ responses }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [31.219389, 29.941736],
      zoom: 13,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "\u00a9 OpenStreetMap contributors",
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    for (const r of responses) {
      if (r.start_lat && r.start_lng) {
        const startMarker = L.circleMarker([r.start_lat, r.start_lng], {
          radius: 7,
          color: "#fff",
          fillColor: "#10b981",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map);
        startMarker.bindPopup(
          `<b>${r.user_code}</b> #${r.test_number}<br/>Start`,
        );
        bounds.extend([r.start_lat, r.start_lng]);
      }
      if (r.dest_lat && r.dest_lng) {
        const destMarker = L.circleMarker([r.dest_lat, r.dest_lng], {
          radius: 7,
          color: "#fff",
          fillColor: "#ef4444",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map);
        destMarker.bindPopup(
          `<b>${r.user_code}</b> #${r.test_number}<br/>Destination`,
        );
        bounds.extend([r.dest_lat, r.dest_lng]);
      }
      if (r.start_lat && r.start_lng && r.dest_lat && r.dest_lng) {
        L.polyline(
          [
            [r.start_lat, r.start_lng],
            [r.dest_lat, r.dest_lng],
          ],
          { color: "#4f6ef7", weight: 2, opacity: 0.4, dashArray: "6 4" },
        ).addTo(map);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [responses]);

  return <div ref={mapRef} className="admin-map" />;
}

function StatusBadge({ status }) {
  const cls =
    status === "success"
      ? "badge-success"
      : status === "no_routes"
        ? "badge-warn"
        : "badge-error";
  return <span className={`admin-badge ${cls}`}>{status}</span>;
}

function FeedbackDetail({ label, value }) {
  if (!value) return null;
  return (
    <div className="fb-detail">
      <span className="fb-label">{label}</span>
      <span className="fb-value">{value}</span>
    </div>
  );
}

function ResponseCard({ r, expanded, onToggle }) {
  const overall = r.overall_feedback || {};
  const journeys = r.journeys_with_feedback || [];
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [showApiResponse, setShowApiResponse] = useState(false);

  return (
    <div className="admin-card">
      <div className="admin-card-header" onClick={onToggle}>
        <div className="admin-card-left">
          <span className="admin-user">{r.user_code}</span>
          <span className="admin-test">Test #{r.test_number}</span>
          <StatusBadge status={r.status} />
        </div>
        <div className="admin-card-right">
          {r.created_at && (
            <span className="admin-date">
              {new Date(r.created_at).toLocaleString()}
            </span>
          )}
          <span className="admin-chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="admin-card-body">
          {/* Coordinates */}
          <div className="admin-coords">
            {r.start_lat && (
              <div className="coord-item">
                <span className="coord-icon">📍</span> Start: {r.start_lat},{" "}
                {r.start_lng}
              </div>
            )}
            {r.dest_lat && (
              <div className="coord-item">
                <span className="coord-icon">🏁</span> Dest: {r.dest_lat},{" "}
                {r.dest_lng}
              </div>
            )}
            <div className="coord-item">
              Walking cutoff: {r.walking_cutoff}m
            </div>
          </div>

          {r.error_message && (
            <div className="admin-error-msg">Error: {r.error_message}</div>
          )}

          {/* Journey map - shown when a journey is selected */}
          {selectedJourney != null && journeys[selectedJourney]?.legs && (
            <div className="admin-journey-map-section">
              <h4 className="admin-section-title">
                Journey {selectedJourney + 1} Route Map
              </h4>
              <JourneyMap legs={journeys[selectedJourney].legs} />
            </div>
          )}

          {/* Per-journey feedback */}
          {journeys.length > 0 && (
            <div className="admin-journeys-section">
              <h4 className="admin-section-title">
                Journey Feedback ({journeys.length})
              </h4>
              {journeys.map((j, i) => {
                const fb = j.userFeedback || {};
                const s = j.summary || {};
                const isSelected = selectedJourney === i;
                return (
                  <div
                    key={j.id || i}
                    className={`admin-journey-item${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedJourney(isSelected ? null : i)}
                  >
                    <div className="admin-journey-header">
                      <span className="admin-journey-toggle">
                        {isSelected ? "🗺️" : "📍"}
                      </span>
                      Journey {i + 1}
                      {s.total_time_minutes && (
                        <span className="admin-stat">
                          ⏱ {s.total_time_minutes}min
                        </span>
                      )}
                      {s.cost != null && (
                        <span className="admin-stat">💰 {s.cost} EGP</span>
                      )}
                      {s.transfers != null && (
                        <span className="admin-stat">🔄 {s.transfers}</span>
                      )}
                      {s.walking_distance_meters != null && (
                        <span className="admin-stat">
                          🚶 {s.walking_distance_meters}m
                        </span>
                      )}
                    </div>
                    {j.text_summary && (
                      <p className="admin-journey-summary">{j.text_summary}</p>
                    )}
                    <div className="fb-details-grid">
                      <FeedbackDetail
                        label="Price opinion"
                        value={fb.priceOpinion}
                      />
                      <FeedbackDetail
                        label="Real price"
                        value={
                          fb.realPrice != null ? `${fb.realPrice} EGP` : null
                        }
                      />
                      <FeedbackDetail
                        label="Time accuracy"
                        value={fb.timeAccuracy}
                      />
                      <FeedbackDetail
                        label="Would choose"
                        value={fb.wouldChoose}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Raw API response */}
          {r.api_response && (
            <div className="admin-api-section">
              <button
                className="btn-outline admin-api-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowApiResponse(!showApiResponse);
                }}
              >
                {showApiResponse ? "Hide" : "Show"} API Response
              </button>
              {showApiResponse && (
                <pre className="admin-api-json">
                  {JSON.stringify(r.api_response, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Overall feedback */}
          {Object.keys(overall).length > 0 && (
            <div className="admin-overall-section">
              <h4 className="admin-section-title">Overall Feedback</h4>
              <div className="fb-details-grid">
                <FeedbackDetail
                  label="Satisfaction"
                  value={overall.satisfaction}
                />
                <FeedbackDetail label="Variety" value={overall.variety} />
                <FeedbackDetail label="Relevance" value={overall.relevance} />
                <FeedbackDetail label="Trust" value={overall.trust} />
              </div>
              {overall.comments && (
                <div className="admin-comments">
                  <span className="fb-label">Comments:</span>
                  <p>{overall.comments}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filterUser, setFilterUser] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/responses`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setResponses(data.responses || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filterUser
    ? responses.filter((r) =>
        r.user_code?.toLowerCase().includes(filterUser.toLowerCase()),
      )
    : responses;

  const uniqueUsers = [...new Set(responses.map((r) => r.user_code))];

  const successCount = filtered.filter((r) => r.status === "success").length;
  const noRouteCount = filtered.filter((r) => r.status === "no_routes").length;
  const errorCount = filtered.filter((r) => r.status === "error").length;

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner" style={{ maxWidth: 1000 }}>
          <h1 className="header-title">ADMIN DASHBOARD</h1>
          <a href="/" className="admin-back-link">
            ← Back to App
          </a>
        </div>
      </header>

      <main className="main" style={{ maxWidth: 1000 }}>
        {loading && <p className="admin-loading">Loading responses...</p>}
        {error && <p className="search-error">{error}</p>}

        {!loading && !error && (
          <>
            {/* Stats bar */}
            <div className="admin-stats-bar">
              <div className="admin-stat-box">
                <div className="admin-stat-number">{responses.length}</div>
                <div className="admin-stat-label">Total Tests</div>
              </div>
              <div className="admin-stat-box">
                <div className="admin-stat-number">{uniqueUsers.length}</div>
                <div className="admin-stat-label">Users</div>
              </div>
              <div className="admin-stat-box">
                <div className="admin-stat-number">{successCount}</div>
                <div className="admin-stat-label">Success</div>
              </div>
              <div className="admin-stat-box">
                <div className="admin-stat-number">{noRouteCount}</div>
                <div className="admin-stat-label">No Routes</div>
              </div>
              <div className="admin-stat-box">
                <div className="admin-stat-number">{errorCount}</div>
                <div className="admin-stat-label">Errors</div>
              </div>
            </div>

            {/* Map of all points */}
            {filtered.length > 0 && <AdminMap responses={filtered} />}

            {/* Filter */}
            <div className="admin-filter-row">
              <input
                type="text"
                placeholder="Filter by user code..."
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="input admin-filter-input"
              />
              <button className="btn-outline" onClick={fetchData}>
                Refresh 🔄
              </button>
            </div>

            {/* Response list */}
            {filtered.length === 0 ? (
              <p className="admin-empty">No responses found.</p>
            ) : (
              <div className="admin-list">
                {filtered.map((r) => (
                  <ResponseCard
                    key={r.id}
                    r={r}
                    expanded={expandedId === r.id}
                    onToggle={() =>
                      setExpandedId(expandedId === r.id ? null : r.id)
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
