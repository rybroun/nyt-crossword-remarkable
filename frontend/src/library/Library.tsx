import { useState, useRef, useMemo } from 'react';
import type { BookResult, BookSendRecord, FetchState } from '../types';
import { api } from '../api';
import './Library.css';

interface Props {
  booksFolder: string;
  fetchState: FetchState;
  addToast: (msg: string) => void;
  libgenStatus: string;
  rmStatus: string;
}

export default function Library({ booksFolder, fetchState, addToast, libgenStatus, rmStatus }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [format, setFormat] = useState('any');
  const [recentlySent, setRecentlySent] = useState<BookSendRecord[]>([]);

  // Load recently sent on first render
  const [loadedRecent, setLoadedRecent] = useState(false);
  if (!loadedRecent) {
    setLoadedRecent(true);
    api.library.recent().then(setRecentlySent).catch(() => {});
  }

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.library.search(q, format);
      setResults(res.results || []);
    } catch {
      addToast('Search failed');
      setResults([]);
    }
    setLoading(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const visible = useMemo(() => {
    if (format === 'any') return results;
    return results.filter(b => b.format === format);
  }, [results, format]);

  const handleSend = async (book: BookResult) => {
    if (rmStatus !== 'ok') {
      addToast('reMarkable disconnected — fix connection first');
      return;
    }
    if (libgenStatus === 'unreachable') {
      addToast('Mirror is down — try Reset mirror in Settings');
      return;
    }
    try {
      await api.library.send(book);
      addToast(`Sending "${book.title}"…`);
      // Refresh recent after a delay
      setTimeout(() => {
        api.library.recent().then(setRecentlySent).catch(() => {});
      }, 8000);
    } catch {
      addToast('Failed to start send');
    }
  };

  return (
    <section className="section library-section">
      <div className="section-head">
        <h2>Library</h2>
        <div className="kicker">Search · download · send</div>
      </div>

      <form className="lib-search" onSubmit={onSubmit}>
        <div className="lib-search-input-wrap">
          <span className="lib-search-glyph" aria-hidden="true">&#x2315;</span>
          <input ref={inputRef}
                 type="text"
                 className="lib-search-input"
                 placeholder="Search by title, author, or ISBN…"
                 value={query}
                 onChange={e => setQuery(e.target.value)} />
          {query && (
            <button type="button"
                    className="lib-search-clear"
                    onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                    aria-label="Clear">&times;</button>
          )}
        </div>
        <button type="submit" className="btn accent lib-search-submit" disabled={!query.trim() || loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div className="lib-controls">
        <div className="lib-format-chips" role="tablist" aria-label="Format filter">
          {[
            { id: 'any', label: 'Any format' },
            { id: 'epub', label: 'epub' },
            { id: 'pdf', label: 'pdf' },
          ].map(f => (
            <button key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={format === f.id}
                    className={`lib-chip ${format === f.id ? 'on' : ''}`}
                    onClick={() => setFormat(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {hasSearched && !loading && (
          <div className="lib-result-count">
            {visible.length === 0
              ? 'No matches'
              : `${visible.length} result${visible.length === 1 ? '' : 's'}`}
            {visible.length > 0 && <span className="dim"> · sourced from Libgen mirror</span>}
          </div>
        )}
      </div>

      <div className="lib-results">
        {loading && (
          <div className="lib-skeletons">
            {[0, 1, 2].map(i => <BookSkeleton key={i} />)}
          </div>
        )}

        {!loading && hasSearched && visible.length === 0 && (
          <div className="lib-empty">
            <div className="lib-empty-mark">&empty;</div>
            <div className="lib-empty-title">No copies in the mirror</div>
            <div className="lib-empty-sub">
              Try a different spelling, or relax the format filter.
            </div>
          </div>
        )}

        {!loading && !hasSearched && (
          <div className="lib-empty quiet">
            <div className="lib-empty-mark serif">&para;</div>
            <div className="lib-empty-title">Anything in particular?</div>
            <div className="lib-empty-sub">
              The daemon will fetch a clean copy and send it to <span className="mono-inline">{booksFolder}</span> on your tablet.
            </div>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <ul className="lib-list">
            {visible.map(b => (
              <BookRow key={b.id}
                       book={b}
                       sending={fetchState.phase !== 'idle'}
                       alreadySent={recentlySent.some(r => r.book_id === b.id)}
                       onSend={() => handleSend(b)} />
            ))}
          </ul>
        )}
      </div>

      {recentlySent.length > 0 && (
        <div className="lib-recent">
          <div className="lib-recent-head">
            <div className="recent-title">Recently sent</div>
            <div className="recent-sub">Last {recentlySent.length} book{recentlySent.length === 1 ? '' : 's'} delivered to <span className="mono-inline">{booksFolder}</span></div>
          </div>
          <ul className="recent-list">
            {recentlySent.slice(0, 5).map(r => (
              <li key={r.book_id + r.sent_at} className="recent-row">
                <div className="recent-cover" aria-hidden="true">
                  <span className="rc-letter">{r.title[0]}</span>
                </div>
                <div className="recent-meta">
                  <div className="recent-name">{r.title}</div>
                  <div className="recent-byline">{r.author}</div>
                </div>
                <div className="recent-fmt"><FormatTag fmt={r.format} /></div>
                <div className="recent-when">{r.sent_at}</div>
                <button className="recent-action"
                        onClick={() => addToast(`Resending ${r.title}…`)}>
                  Resend
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function BookRow({ book, sending, alreadySent, onSend }: {
  book: BookResult; sending: boolean; alreadySent: boolean; onSend: () => void;
}) {
  return (
    <li className="book-row">
      <div className="book-cover" aria-hidden="true">
        <CoverPlaceholder title={book.title} author={book.author} format={book.format} />
      </div>
      <div className="book-meta">
        <div className="book-title-line">
          <h3 className="book-title">{book.title}</h3>
          <FormatTag fmt={book.format} />
        </div>
        <div className="book-byline">
          {book.author} · <span className="dim">{book.publisher}{book.publisher && book.year ? ', ' : ''}{book.year}</span>
        </div>
        <dl className="book-stats">
          <dt>Size</dt><dd>{book.size || '—'}</dd>
          <dt>Pages</dt><dd>{book.pages || '—'}</dd>
          <dt>Lang</dt><dd>{book.language || '—'}</dd>
          <dt>Sources</dt><dd>{book.sources} mirror{book.sources === 1 ? '' : 's'}</dd>
          <dt>ISBN</dt><dd className="mono-inline">{book.isbn || '—'}</dd>
        </dl>
      </div>
      <div className="book-actions">
        <button className="btn accent sm" disabled={sending} onClick={onSend}>
          {alreadySent ? 'Send again' : 'Send to tablet'}
        </button>
      </div>
    </li>
  );
}

function BookSkeleton() {
  return (
    <div className="book-row sk" aria-hidden="true">
      <div className="book-cover sk" />
      <div className="book-meta">
        <div className="sk-line w70" />
        <div className="sk-line w40" />
        <div className="sk-line w95" />
        <div className="sk-line w85" />
      </div>
      <div className="book-actions">
        <div className="sk-btn" />
      </div>
    </div>
  );
}

function CoverPlaceholder({ title, author, format }: { title: string; author: string; format: string }) {
  const variants = [
    { bg: 'oklch(28% 0.04 60)', ink: 'oklch(96% 0.012 85)' },
    { bg: 'oklch(36% 0.10 30)', ink: 'oklch(96% 0.012 85)' },
    { bg: 'oklch(40% 0.08 150)', ink: 'oklch(96% 0.012 85)' },
    { bg: 'oklch(96% 0.012 85)', ink: 'oklch(22% 0.015 60)' },
    { bg: 'oklch(32% 0.05 250)', ink: 'oklch(96% 0.012 85)' },
  ];
  const v = variants[(title.length + author.length) % variants.length];
  const stop = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'for', 'to', 'in', 'on', 'at']);
  const words = title.replace(/[:.,]/g, '').split(/\s+/).filter(w => !stop.has(w.toLowerCase()));
  const initials = words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="cover-art" style={{ background: v.bg, color: v.ink }}>
      <div className="cover-rule" style={{ borderColor: v.ink }} />
      <div className="cover-initials">{initials}</div>
      <div className="cover-author">{author}</div>
      <div className="cover-format">{format}</div>
    </div>
  );
}

function FormatTag({ fmt }: { fmt: string }) {
  return <span className={`fmt-tag fmt-${fmt}`}>{fmt}</span>;
}
