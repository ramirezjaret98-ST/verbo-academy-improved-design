import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, MessageCircle, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { Club, ClubType } from "@/lib/clubs-store";
import { ClubReservationModal } from "@/components/verbo/ClubReservationModal";
import { loadMyRepeatRequests, requestClubRepeat, submitClubSuggestion, type ClubRepeatRequest } from "@/lib/club-catalog-store";
import { useCoreFreemiumGate } from "@/components/verbo/CoreFreemiumFlow";
import { useAuth } from "@/lib/auth";
import { visibleClubTypes } from "@/lib/club-access";
import insightsWordmark from "@/assets/insights-wordmark.svg";
import booksWordmark from "@/assets/book-clubs-wordmark.svg";
import "./ClubCatalog.css";

type Collection = "all" | ClubType;
const formatDate = (value: string) => new Date(value).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric",
});
const isPast = (club: Club) => new Date(club.date).getTime() + club.duration_minutes * 60_000 < Date.now();

export function ClubCatalog({ clubs, studentId, preview = false }: {
  clubs: Club[]; studentId: string; preview?: boolean;
}) {
  const { user } = useAuth();
  const allowedTypes = preview ? (["insight", "book"] as ClubType[]) : visibleClubTypes(user);
  const freemium = useCoreFreemiumGate(preview ? null : user);
  const [collection, setCollection] = useState<Collection>("all");
  const [category, setCategory] = useState("all");
  const [featureIndex, setFeatureIndex] = useState(0);
  const [pauseFeature, setPauseFeature] = useState(false);
  const [selected, setSelected] = useState<Club | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [repeatClub, setRepeatClub] = useState<Club | null>(null);
  const [repeatReason, setRepeatReason] = useState<ClubRepeatRequest["reason"]>("missed");
  const [repeatIds, setRepeatIds] = useState<Set<number>>(new Set());
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [repeatConfirm, setRepeatConfirm] = useState(false);

  useEffect(() => {
    if (preview || !studentId) return;
    void loadMyRepeatRequests(studentId).then((rows) => {
      setRepeatIds(new Set(rows.map((row) => row.club_id)));
    }).catch(() => {});
  }, [preview, studentId]);

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const active = clubs
    .filter((club) => allowedTypes.includes(club.type) && club.status === "upcoming" && new Date(club.date).getTime() + club.duration_minutes * 60_000 >= clock)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const archive = clubs
    .filter((club) => allowedTypes.includes(club.type) && club.type === "insight" && club.status !== "cancelled" && new Date(club.date).getTime() + club.duration_minutes * 60_000 < clock)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const categories = Array.from(new Set(
    [...active, ...archive].filter((club) => club.type === "insight")
      .map((club) => club.topic_tag?.trim()).filter((tag): tag is string => !!tag),
  )).sort();
  const matchesCategory = (club: Club) => category === "all" || club.topic_tag === category;
  const featureCandidates = active.filter((club) =>
    (collection === "all" || club.type === collection) &&
    (club.type !== "insight" || matchesCategory(club)),
  );
  const marked = featureCandidates.filter((club) => club.catalog_featured);
  const featured = marked.length ? marked : featureCandidates;
  const slideIndex = featured.length ? featureIndex % featured.length : 0;
  const slide = featured[slideIndex];
  const nextSlide = featured[(slideIndex + 1) % featured.length];

  useEffect(() => { setFeatureIndex(0); }, [collection, category]);
  useEffect(() => {
    if (pauseFeature || featured.length < 2) return;
    const timer = window.setInterval(() => setFeatureIndex((index) => index + 1), 8_000);
    return () => window.clearInterval(timer);
  }, [pauseFeature, featured.length, collection, category]);

  const openClub = (club: Club) => {
    if (isPast(club)) { setRepeatClub(club); return; }
    if (preview) { setSelected(club); return; }
    freemium.tryOpen(club.type, () => setSelected(club));
  };

  const askRepeat = async () => {
    if (!repeatClub || preview || repeatBusy) return;
    setRepeatBusy(true);
    try {
      await requestClubRepeat(studentId, repeatClub.id, repeatReason);
      setRepeatIds((prev) => new Set([...prev, Number(repeatClub.id)]));
      setRepeatClub(null);
      setRepeatConfirm(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send your request.");
    } finally { setRepeatBusy(false); }
  };

  const poster = (club: Club) => (
    <button className="vc-poster" key={club.id} onClick={() => openClub(club)}
      aria-label={`Explore ${club.title}, ${formatDate(club.date)}`}>
      <span className="vc-poster-art">
        {club.cover_image && <span className="vc-poster-image"><img src={club.cover_image} alt="" loading="lazy" decoding="async" style={{ objectPosition: `${club.cover_position_x ?? 50}% ${club.cover_position_y ?? 50}%`, transformOrigin: `${club.cover_position_x ?? 50}% ${club.cover_position_y ?? 50}%`, transform: `scale(${club.cover_scale ?? 1})` }} /></span>}
        <span className="vc-poster-fade" />
        {club.type === "insight" && <span className="vc-poster-title">{club.title}</span>}
        {!club.cover_image && club.type === "book" && <BookOpen className="vc-poster-placeholder" />}
      </span>
      <span className="vc-poster-meta"><strong>{club.title}</strong><small>{isPast(club) ? "Held " : ""}{formatDate(club.date)}</small></span>
    </button>
  );

  const shelf = (title: string, subtitle: string, items: Club[]) => items.length > 0 && (
    <section className="vc-shelf">
      <div className="vc-shelf-head"><div><h2>{title}</h2><p>{subtitle}</p></div><span>DRAG TO EXPLORE <ArrowRight size={14} /></span></div>
      <div className="vc-shelf-track">{items.map(poster)}</div>
    </section>
  );

  return <div className="vc-catalog">
    <div className="vc-inner">
      <div className="vc-heading">
        <div><span className="vc-eyebrow">YOUR COLLECTIONS</span><h1>Explore Clubs</h1><p>Live conversations worth making time for.</p></div>
        {!preview && allowedTypes.length > 0 && <button className="vc-suggest-top" onClick={() => setSuggesting(true)}>＋ Suggest a club</button>}
      </div>
      <div className={`vc-collections ${allowedTypes.length === 1 ? "is-single" : ""}`}>
        {allowedTypes.includes("insight") && <button className={`vc-collection ${collection === "insight" ? "is-active" : ""}`}
          onClick={() => setCollection(collection === "insight" ? "all" : "insight")} aria-pressed={collection === "insight"}>
          <img src={insightsWordmark} alt="Insights" /><span>VIEW COLLECTION <ChevronRight size={15} /></span>
        </button>}
        {allowedTypes.includes("book") && <button className={`vc-collection ${collection === "book" ? "is-active" : ""}`}
          onClick={() => setCollection(collection === "book" ? "all" : "book")} aria-pressed={collection === "book"}>
          <img src={booksWordmark} alt="Book Clubs" /><span>VIEW COLLECTION <ChevronRight size={15} /></span>
        </button>}
      </div>

      {slide ? <section className="vc-feature" onMouseEnter={() => setPauseFeature(true)}
        onMouseLeave={() => setPauseFeature(false)} onFocus={() => setPauseFeature(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPauseFeature(false); }}
        aria-label="Featured clubs">
        <div className="vc-feature-atmosphere" />
        {slide.cover_image && <img className="vc-feature-image" src={slide.cover_image} alt="" decoding="async" style={{ objectPosition: `${slide.cover_position_x ?? 50}% ${slide.cover_position_y ?? 50}%` }} />}
        <div className="vc-feature-shade" />
        <div className="vc-feature-content">
          <div className="vc-feature-copy">
            <span className="vc-eyebrow">FEATURED {slide.type === "book" ? "BOOK CLUB" : "INSIGHT"} {slide.topic_tag && ` / ${slide.topic_tag.toUpperCase()}`}</span>
            <h2 className={slide.title_font === "display" ? "vc-display" : slide.title_font === "sans" ? "vc-sans" : ""}>{slide.title}</h2>
            {slide.subtitle && <p className="vc-feature-subtitle">{slide.subtitle}</p>}
            {slide.description && <p className="vc-feature-description">{slide.description}</p>}
          </div>
          <div className="vc-feature-actions">
            <button className="vc-primary" onClick={() => openClub(slide)}>Explore {slide.type === "book" ? "Book Club" : "Insight"} ↗</button>
            <button className="vc-outline" onClick={() => openClub(slide)}>Reserve a seat</button>
          </div>
          <div className="vc-feature-bottom">
            <div className="vc-pagination">{featured.map((item, index) => <button key={item.id} className={index === slideIndex ? "active" : ""}
              aria-label={`Show ${item.title}`} aria-current={index === slideIndex} onClick={() => setFeatureIndex(index)}><span /></button>)}</div>
            <div className="vc-next"><small>UP NEXT</small><span>{nextSlide.title}</span></div>
            <div className="vc-arrows"><span>{String(slideIndex + 1).padStart(2, "0")} / {String(featured.length).padStart(2, "0")}</span>
              <button aria-label="Previous featured club" onClick={() => setFeatureIndex((index) => (index + featured.length - 1) % featured.length)}><ArrowLeft size={17} /></button>
              <button aria-label="Next featured club" onClick={() => setFeatureIndex((index) => index + 1)}><ArrowRight size={17} /></button>
            </div>
          </div>
        </div>
      </section> : <div className="vc-empty-feature"><MessageCircle size={28} /><h2>No upcoming clubs yet</h2><p>New clubs in your collection will appear here as soon as they are published.</p></div>}

      {collection !== "book" && categories.length > 0 && <div className="vc-filters"><div><span className="vc-eyebrow">EXPLORE BY THEME</span><h2>Find a conversation for you.</h2></div>
        <div>{["all", ...categories].map((item) => <button key={item} className={category === item ? "active" : ""}
          onClick={() => setCategory(item)}>{item === "all" ? "All Insights" : item}</button>)}</div></div>}
      {collection !== "book" && shelf("Upcoming Insights", "Join the next live conversation.", active.filter((c) => c.type === "insight" && matchesCategory(c)))}
      {collection !== "insight" && shelf("Book Clubs", "Read. Think. Discuss.", active.filter((c) => c.type === "book"))}
      {collection !== "book" && shelf("Previously held Insights", "Missed one? Ask us to bring it back.", archive.filter(matchesCategory))}
      {!preview && allowedTypes.length > 0 && <div className="vc-suggest-strip"><div><span className="vc-eyebrow">YOUR VOICE SHAPES THE CATALOG</span><h2>What should we explore next?</h2><p>Suggest a club for your collection.</p></div><button onClick={() => setSuggesting(true)}>Share an idea ↗</button></div>}
    </div>
    {selected && <ClubReservationModal club={selected} studentId={studentId} preview={preview} onClose={() => setSelected(null)} />}
    {repeatClub && createPortal(<div className="vc-dialog-backdrop"><section className="vc-dialog" role="dialog" aria-modal="true" aria-label={repeatClub.title}>
      <button className="vc-dialog-close" aria-label="Close" onClick={() => setRepeatClub(null)}><X size={20} /></button>
      <span className="vc-eyebrow">FROM THE ARCHIVE</span><h2>{repeatClub.title}</h2><p>{repeatClub.description}</p>
      <p className="vc-dialog-date">Held {formatDate(repeatClub.date)}</p>
      {repeatIds.has(Number(repeatClub.id)) ? <p className="vc-requested">✓ Your request is on the list.</p> : <>
        <h3>Want another edition?</h3><p>Tell us why you would like to see this Insight again.</p>
        <div className="vc-reasons">{([["missed", "I missed it"], ["full", "It was full"], ["again", "I would do it again"]] as const).map(([value, label]) =>
          <button key={value} className={repeatReason === value ? "active" : ""} onClick={() => setRepeatReason(value)}>{label}</button>)}</div>
        <button className="vc-primary" disabled={preview || repeatBusy} onClick={() => void askRepeat()}>{repeatBusy ? "Sending…" : "Request another edition ↗"}</button>
      </>}
    </section></div>, document.body)}
    {repeatConfirm && createPortal(<div className="vc-dialog-backdrop"><section className="vc-dialog" role="dialog" aria-modal="true" aria-label="Request received"><Sparkles size={30} /><h2>Request received</h2><p>Thank you. When four students ask for another edition, we consider bringing the Insight back.</p><button className="vc-primary" onClick={() => setRepeatConfirm(false)}>Done</button></section></div>, document.body)}
    {suggesting && allowedTypes.length > 0 && createPortal(<SuggestionDialog studentId={studentId} allowedTypes={allowedTypes} onClose={() => setSuggesting(false)} />, document.body)}
    {!preview && freemium.node}
  </div>;
}

function SuggestionDialog({ studentId, allowedTypes, onClose }: { studentId: string; allowedTypes: ClubType[]; onClose: () => void }) {
  const [type, setType] = useState<ClubType>(allowedTypes[0]);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await submitClubSuggestion(studentId, { type, title, details });
      toast.success("Thank you — your suggestion has been sent.");
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send your suggestion."); }
    finally { setBusy(false); }
  };
  return <div className="vc-dialog-backdrop"><form className="vc-dialog" role="dialog" aria-modal="true" aria-label="Suggest a club" onSubmit={(event) => void submit(event)}>
    <button type="button" className="vc-dialog-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
    <span className="vc-eyebrow">YOUR IDEA, OUR NEXT CONVERSATION</span><h2>Suggest a club</h2>
    <p>Share an idea for a club in your collection.</p>
    {allowedTypes.length > 1 && <label>Type<select value={type} onChange={(event) => setType(event.target.value as ClubType)}><option value="insight">Insight topic</option><option value="book">Book Club</option></select></label>}
    <label>{type === "book" ? "Book title" : "Topic"}<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={160} /></label>
    <label>Why this one?<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={4} /></label>
    {error && <p role="alert" className="vc-error">{error}</p>}
    <button className="vc-primary" disabled={busy}>{busy ? "Sending…" : "Send suggestion ↗"}</button>
  </form></div>;
}
