import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

/* Section Header */

function SectionHeader({ number, title, subtitle }) {
  return (
    <div className="section-header">
      <div className="section-header-row">
        <div className="section-number">{number}</div>
        <h2 className="section-title">{title}</h2>
      </div>
      {subtitle && <p className="section-subtitle">{subtitle}</p>}
    </div>
  );
}

/* Location Picker (click-on-map) */

function LocationPicker({ label, value, onChange }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [31.219389, 29.941736],
      zoom: 15,
      scrollWheelZoom: true,
      zoomControl: true,
      dragging: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "\u00a9 OpenStreetMap contributors",
    }).addTo(map);

    map.on("click", (e) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng]).addTo(map);
      }
      onChange({
        lat: parseFloat(lat.toFixed(6)),
        lng: parseFloat(lng.toFixed(6)),
      });
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Sync marker if value set externally
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (value) {
      if (markerRef.current) {
        markerRef.current.setLatLng([value.lat, value.lng]);
      } else {
        markerRef.current = L.marker([value.lat, value.lng]).addTo(
          mapInstanceRef.current,
        );
      }
    }
  }, [value]);

  return (
    <div className="location-picker">
      <label className="field-label">{label}</label>
      <div ref={mapRef} className="map-container" />
      {value && (
        <div className="location-display">
          <span className="icon">📍</span>
          {value.lat}, {value.lng}
        </div>
      )}
    </div>
  );
}

/* Search Section (inline) */

function SearchSection({
  start,
  setStart,
  dest,
  setDest,
  onSearch,
  searched,
  loading,
  error,
  noRoutesInfo,
  walkingCutoff,
  setWalkingCutoff,
  onRetry,
}) {
  const canSearch = start && dest && !loading;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSearch) onSearch(start, dest);
  };

  return (
    <div>
      <SectionHeader
        number={1}
        title="اعرف الطرق المتاحة"
        subtitle="اختار مكانك ووجهتك في مشوار انت عارفه كويس "
      />
      <div className="card">
        <form onSubmit={handleSubmit} className="search-form">
          <LocationPicker
            label="📌 مكانك فين"
            value={start}
            onChange={setStart}
          />
          <LocationPicker label="🏁 رايح فين" value={dest} onChange={setDest} />
          {!searched && !noRoutesInfo && (
            <button
              type="submit"
              className={`btn-primary${canSearch ? "" : " disabled"}`}
            >
              {loading ? "Searching…" : "اروح ازاي"}
            </button>
          )}
          {error && <p className="search-error">{error}</p>}
        </form>
      </div>

      {noRoutesInfo && (
        <div className="card no-routes-card">
          <div className="no-routes-icon">⚠️</div>
          <p className="no-routes-message">{noRoutesInfo.message}</p>
          <p className="no-routes-hint">
            تأكد إن النقط اللي اخترتها جوه حدود إسكندرية، أو جرب تزود مسافة
            المشي
          </p>
          <div className="walking-cutoff-group">
            <label className="field-label">مسافة المشي القصوى (بالمتر)</label>
            <input
              type="number"
              min={500}
              max={5000}
              step={100}
              value={walkingCutoff}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 500 && v <= 5000) setWalkingCutoff(v);
                else if (e.target.value === "") setWalkingCutoff("");
              }}
              className="input walking-input"
            />
            <span className="walking-range-hint">500 – 5000 متر</span>
          </div>
          <button
            className={`btn-primary${canSearch ? "" : " disabled"}`}
            onClick={() => {
              if (canSearch) onRetry();
            }}
          >
            {loading ? "Searching…" : "جرب تاني 🔄"}
          </button>
        </div>
      )}
    </div>
  );
}

/* Stat helper */

function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

/* Leaflet Map */

const LEG_COLORS = {
  walk: "#10b981", // green
  transfer: "#10b981", // green
  trip: "#4f6ef7", // blue
};

function RouteMap({ legs }) {
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
      scrollWheelZoom: false,
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

  return <div ref={mapRef} className="route-map" />;
}

/* Option Button Group (reusable) */

function OptionGroup({ label, options, value, onChange }) {
  return (
    <div className="option-group">
      <label className="field-label">{label}</label>
      <div className="option-group-buttons">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`option-btn${value === opt ? " active" : ""}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Evaluate Journeys Section (← → navigation, inline) */

function EvalSection({ journeys, feedbackMap, setFeedbackMap }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const journey = journeys[currentIdx];
  const currentId = journey.id;
  const s = journey.summary;
  const fb = feedbackMap[currentId] || {};

  const updateFb = (patch) => {
    setFeedbackMap((prev) => ({
      ...prev,
      [currentId]: { ...prev[currentId], id: currentId, ...patch },
    }));
  };

  const isFirst = currentIdx === 0;
  const isLast = currentIdx === journeys.length - 1;

  return (
    <div>
      <SectionHeader
        number={2}
        title="Evaluate Each Journey"
        subtitle="Use the arrows to navigate between journeys and give feedback on each one."
      />

      {/* Sub-header with dots */}
      <div className="eval-subheader">
        <h3 className="eval-counter">
          Journey {currentIdx + 1}{" "}
          <span className="eval-counter-total">/ {journeys.length}</span>
        </h3>
        <div className="eval-dots">
          {journeys.map((_, i) => (
            <div
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`eval-dot${i === currentIdx ? " active" : ""}`}
            />
          ))}
        </div>
      </div>

      {/* Map */}
      <RouteMap legs={journey.legs || []} />

      {/* Journey info card */}
      <div className="card journey-info-card">
        <div className="journey-stats">
          <Stat icon="⏱" label="Time" value={`${s.total_time_minutes} min`} />
          <Stat icon="💰" label="Cost" value={`${s.cost} EGP`} />
          <Stat icon="🔄" label="Transfers" value={s.transfers} />
          <Stat
            icon="🚶"
            label="Walking"
            value={`${s.walking_distance_meters} m`}
          />
        </div>
        <div className="journey-modes">
          {s.modes.map((m) => (
            <span key={m} className="mode-tag">
              {m}
            </span>
          ))}
        </div>
        <p className="journey-summary-text">{journey.text_summary}</p>
      </div>

      {/* Feedback form */}
      <div className="card feedback-card">
        <OptionGroup
          label="السعر منطقي؟"
          options={["ارخص من الطبيعي", "منطقي", "اغلي من الطبيعي"]}
          value={fb.priceOpinion}
          onChange={(v) => updateFb({ priceOpinion: v })}
        />

        <div className="price-input-group">
          <label className="field-label">
            ايه السعر الي شايفة منطقي للمشوار ده؟
          </label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 10"
            value={fb.realPrice ?? ""}
            onChange={(e) =>
              updateFb({
                realPrice:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="input price-input"
          />
        </div>

        <OptionGroup
          label="وقت المشوار منطقي ؟"
          options={["اقل من الطبيعي", "منطقي", "اكتر من الطبيعي"]}
          value={fb.timeAccuracy}
          onChange={(v) => updateFb({ timeAccuracy: v })}
        />

        <OptionGroup
          label="هل ممكن تفضل الاوبشن ده في مشوارك؟"
          options={[
            "ده الاساسي",
            "ممكن",
            "غالبا لا",
            "الاوبشن ده غلط او مش منطقي",
          ]}
          value={fb.wouldChoose}
          onChange={(v) => updateFb({ wouldChoose: v })}
        />
      </div>

      {/* Navigation */}
      <div className="nav-row">
        <button
          className={`btn-outline${isFirst ? " disabled" : ""}`}
          onClick={() => setCurrentIdx((i) => i - 1)}
        >
          ← الي فات
        </button>
        <button
          className={`btn-primary${isLast ? " disabled" : ""}`}
          onClick={() => setCurrentIdx((i) => i + 1)}
        >
          الاوبشن الي بعده →
        </button>
      </div>
    </div>
  );
}

/* Overall Response Feedback Section */

function OverallFeedbackSection({ overallFeedback, setOverallFeedback }) {
  const update = (patch) =>
    setOverallFeedback((prev) => ({ ...prev, ...patch }));

  return (
    <div>
      <SectionHeader
        number={3}
        title="Overall Feedback"
        subtitle="Share your overall impression of the journey results provided."
      />

      <div className="card">
        <OptionGroup
          label="قد إيه أنت راضي عن اختيارات الرحلة اللي ظهرتلك؟"
          options={[
            "راضي جدًا",
            "راضي",
            "محايد",
            "غير راضي",
            "غير راضي اطلاقا",
          ]}
          value={overallFeedback.satisfaction}
          onChange={(v) => update({ satisfaction: v })}
        />

        <OptionGroup
          label="هل النتائج كان فيها تنوع كفاية في الطرق؟"
          options={[
            "آه، تنوع ممتاز",
            "تنوع مقبول",
            "التنوع مش كفاية",
            "كلهم شبه بعض",
          ]}
          value={overallFeedback.variety}
          onChange={(v) => update({ variety: v })}
        />

        <OptionGroup
          label="هل الطرق الي متعود عليها موجوده هنا؟"
          options={["كلها", "معظمهم", "واحد بس", "ولا واحد"]}
          value={overallFeedback.relevance}
          onChange={(v) => update({ relevance: v })}
        />

        <OptionGroup
          label="بناء علي النتايج الي طلعت دلوقتي ممكن تثق في البرنامج في مشاوير متعرفهاش؟"
          options={["ايوه جدا", "غالبا", "ممكن بس مع بعض الشك", "لا"]}
          value={overallFeedback.trust}
          onChange={(v) => update({ trust: v })}
        />

        <div>
          <label className="field-label">
            لو عندك أي تعليق إضافي عن النتائج اكتبّه هنا (اختياري):
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Missing a metro-only option, prices seem high…"
            value={overallFeedback.comments || ""}
            onChange={(e) => update({ comments: e.target.value })}
            className="textarea"
          />
        </div>
      </div>
    </div>
  );
}

/* Submission Confirmation */

function ThankYou() {
  return (
    <div className="thank-you">
      <div className="thank-you-icon">🎉</div>
      <h2>Thank You!</h2>
      <p>Your feedback has been recorded.</p>
    </div>
  );
}

/* Divider */

function SectionDivider() {
  return <hr className="section-divider" />;
}

/* App (Single-Page Layout) */

export default function App() {
  const [userCode, setUserCode] = useState("");
  const [start, setStart] = useState(null);
  const [dest, setDest] = useState(null);
  const [query, setQuery] = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [overallFeedback, setOverallFeedback] = useState({});
  const [allResponses, setAllResponses] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [noRoutesInfo, setNoRoutesInfo] = useState(null);
  const [walkingCutoff, setWalkingCutoff] = useState(1200);
  const [lastApiResponse, setLastApiResponse] = useState(null);

  const searched = journeys.length > 0;
  const codeEntered = userCode.trim().length > 0;

  const handleSearch = async (s, d) => {
    setQuery({ start: s, dest: d });
    setLoading(true);
    setError(null);
    setNoRoutesInfo(null);
    try {
      const res = await fetch(`${API_BASE}/api/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_lat: s.lat,
          start_lon: s.lng,
          end_lat: d.lat,
          end_lon: d.lng,
          walking_cutoff: Number(walkingCutoff) || 1200,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setLastApiResponse(data);

      if (!data.journeys || data.journeys.length === 0) {
        let message;
        if (data.start_trips_found === 0 && data.end_trips_found === 0) {
          message = `مفيش مواصلات قريبة من نقطة البداية أو الوصول في حدود ${Number(walkingCutoff) || 1200} متر مشي`;
        } else if (data.start_trips_found === 0) {
          message = `مفيش مواصلات قريبة من نقطة البداية في حدود ${Number(walkingCutoff) || 1200} متر مشي`;
        } else if (data.end_trips_found === 0) {
          message = `مفيش مواصلات قريبة من نقطة الوصول في حدود ${Number(walkingCutoff) || 1200} متر مشي`;
        } else {
          message = data.error || "مفيش طرق متاحة للمشوار ده";
        }
        setNoRoutesInfo({ message, raw: data });
        setJourneys([]);
        // Auto-log this error/no-route case to the backend
        submitToBackend([
          {
            query: { start: s, dest: d },
            status: "no_routes",
            error: message,
            api_response: data,
            walking_cutoff: Number(walkingCutoff) || 1200,
            journeys_with_feedback: null,
            overallFeedback: null,
          },
        ]);
      } else {
        setJourneys(data.journeys);
        setNoRoutesInfo(null);
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
      setJourneys([]);
      // Log the error case to backend
      submitToBackend([
        {
          query: { start: s, dest: d },
          status: "error",
          error: err.message,
          api_response: null,
          walking_cutoff: Number(walkingCutoff) || 1200,
          journeys_with_feedback: null,
          overallFeedback: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (start && dest) handleSearch(start, dest);
  };

  const buildPayload = () => {
    // Merge each journey with its user feedback into a single array
    const journeysWithFeedback = journeys.map((j) => ({
      ...j,
      userFeedback: feedbackMap[j.id] || {},
    }));

    return {
      query,
      status: "success",
      error: null,
      api_response: lastApiResponse,
      walking_cutoff: Number(walkingCutoff) || 1200,
      journeys_with_feedback: journeysWithFeedback,
      overallFeedback,
    };
  };

  const submitToBackend = async (responses) => {
    try {
      const res = await fetch(`${API_BASE}/api/submit-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userCode: userCode.trim(),
          responses,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Submit failed:", text);
      }
    } catch (err) {
      console.error("Submit network error:", err);
    }
  };

  const handleSubmitAndTryAnother = () => {
    const payload = buildPayload();
    setAllResponses((prev) => [...prev, payload]);
    submitToBackend([payload]);
    // Reset everything except userCode
    setStart(null);
    setDest(null);
    setQuery(null);
    setJourneys([]);
    setFeedbackMap({});
    setOverallFeedback({});
    setError(null);
    setNoRoutesInfo(null);
    setWalkingCutoff(1200);
    setLastApiResponse(null);
  };

  const handleFinalSubmit = () => {
    const payload = buildPayload();
    submitToBackend([payload]);
    setSubmitted(true);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1 className="header-title">DEMO EVAL</h1>
          {submitted && <span className="header-submitted">✓ Submitted</span>}
        </div>
      </header>

      <main className="main">
        {submitted ? (
          <ThankYou />
        ) : (
          <>
            {/* User Code */}
            <div style={{ marginBottom: 28 }}>
              <SectionHeader
                number={0}
                title="الكود الخاص بيك"
                subtitle="دخّل الكود اللي اخترته في الفورم"
              />
              <div className="card">
                <label className="field-label">الكود</label>
                <input
                  type="text"
                  placeholder="مثلاً: MARO123"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value)}
                  className="input"
                  style={{ maxWidth: 260 }}
                />
              </div>
            </div>

            {codeEntered && (
              <>
                {allResponses.length > 0 && (
                  <div className="prev-tests-badge">
                    {allResponses.length} test
                    {allResponses.length > 1 ? "s" : ""} submitted so far
                  </div>
                )}

                {/* Section 1: Search */}
                <SearchSection
                  start={start}
                  setStart={setStart}
                  dest={dest}
                  setDest={setDest}
                  onSearch={handleSearch}
                  searched={searched}
                  loading={loading}
                  error={error}
                  noRoutesInfo={noRoutesInfo}
                  walkingCutoff={walkingCutoff}
                  setWalkingCutoff={setWalkingCutoff}
                  onRetry={handleRetry}
                />

                {searched && (
                  <>
                    <SectionDivider />

                    {/* Section 2: Evaluate each journey */}
                    <EvalSection
                      journeys={journeys}
                      feedbackMap={feedbackMap}
                      setFeedbackMap={setFeedbackMap}
                    />

                    <SectionDivider />

                    {/* Section 3: Overall feedback */}
                    <OverallFeedbackSection
                      overallFeedback={overallFeedback}
                      setOverallFeedback={setOverallFeedback}
                    />

                    {/* Submit buttons */}
                    <div className="submit-row submit-row-multi">
                      <button
                        className="btn-outline btn-submit"
                        onClick={handleSubmitAndTryAnother}
                      >
                        Submit & Try Another
                      </button>
                      <button
                        className="btn-primary btn-submit"
                        onClick={handleFinalSubmit}
                      >
                        Finalize & Submit
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
