import {
    ChangeEvent,
    FormEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { ChapterCard } from './components/chapter-card';
import { ConfirmDialog } from './components/confirm-dialog';
import { LoadingOverlay } from './components/loading-overlay';
import { StatusBadge } from './components/status-badge';
import { ToastCenter, ToastItem } from './components/toast-center';
import {
    compileBook,
    deleteBook,
    downloadBook,
    fetchBooks,
    generateChapter,
    generateOutline,
    updateChapterReview,
    updateFinalReview,
    updateOutlineReview,
    uploadSpreadsheet,
} from './lib/api';
import { Book } from './lib/types';
import { formatReviewStatus, formatStage } from './lib/utils';

type IntakeMode = 'single' | 'upload';
type ViewMode = 'dashboard' | 'detail';

interface SingleBookFormState {
  title: string;
  numberOfChapters: string;
  notesOnOutlineBefore: string;
  notesOnOutlineAfter: string;
  statusOutlineNotes: string;
  finalReviewNotesStatus: string;
  finalReviewNotes: string;
}

interface ActionOptions<T> {
  getNextSelectedId?: (result: T) => string | null | undefined;
  onSuccess?: (result: T) => void;
  skipRefresh?: boolean;
}

interface NotificationItem {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterCount: number;
  sourceFileName: string | null;
  type: string;
  message: string;
  createdAt: string;
}

const INITIAL_SINGLE_BOOK_FORM: SingleBookFormState = {
  title: '',
  numberOfChapters: '',
  notesOnOutlineBefore: '',
  notesOnOutlineAfter: '',
  statusOutlineNotes: 'no',
  finalReviewNotesStatus: 'no',
  finalReviewNotes: '',
};

const REVIEW_STATUS_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'no_notes_needed', label: 'No Notes Needed' },
];

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #b9d9ff 0%, #f5f7ff 42%, #ff8a6b 100%)',
  'linear-gradient(135deg, #ffe3c9 0%, #fff5eb 40%, #b5d5ff 100%)',
  'linear-gradient(135deg, #a9e7e1 0%, #f4fbff 38%, #c8a8ff 100%)',
  'linear-gradient(135deg, #ffc6d2 0%, #f9ebff 48%, #9ed8ff 100%)',
];

function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [searchQuery] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('single');
  const [singleBookForm, setSingleBookForm] = useState<SingleBookFormState>(
    INITIAL_SINGLE_BOOK_FORM,
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState(
    'Working on your request...',
  );
  const [outlineStatus, setOutlineStatus] = useState('no');
  const [outlineNotes, setOutlineNotes] = useState('');
  const [finalReviewStatus, setFinalReviewStatus] = useState('no');
  const [finalReviewNotes, setFinalReviewNotes] = useState('');
  const [activeChapterNumber, setActiveChapterNumber] = useState<number | null>(
    null,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId],
  );

  const filteredBooks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return books;
    }

    return books.filter((book) =>
      [
        book.title,
        book.sourceFileName,
        formatStage(book.workflowStatus),
        book.notesOnOutlineBefore,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedQuery),
        ),
    );
  }, [books, searchQuery]);

  const totalChapters = useMemo(
    () => books.reduce((sum, book) => sum + book.chapters.length, 0),
    [books],
  );

  const totalWords = useMemo(
    () => books.reduce((sum, book) => sum + countBookWords(book), 0),
    [books],
  );

  const activeChapter = useMemo(
    () =>
      selectedBook?.chapters.find(
        (chapter) => chapter.chapterNumber === activeChapterNumber,
      ) ?? null,
    [activeChapterNumber, selectedBook],
  );

  const allNotifications = useMemo<NotificationItem[]>(
    () =>
      books
        .flatMap((book) =>
          book.events.map((event) => ({
            id: `${book.id}:${event.id}`,
            bookId: book.id,
            bookTitle: book.title,
            chapterCount: book.chapters.length,
            sourceFileName: book.sourceFileName,
            type: event.type,
            message: event.message,
            createdAt: event.createdAt,
          })),
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        ),
    [books],
  );

  const latestNotifications = useMemo(
    () => allNotifications.slice(0, 5),
    [allNotifications],
  );

  const readNotificationSet = useMemo(
    () => new Set(readNotificationIds),
    [readNotificationIds],
  );

  const unreadNotificationCount = useMemo(
    () =>
      latestNotifications.filter(
        (notification) => !readNotificationSet.has(notification.id),
      ).length,
    [latestNotifications, readNotificationSet],
  );

  const totalUnreadNotificationCount = useMemo(
    () =>
      allNotifications.filter(
        (notification) => !readNotificationSet.has(notification.id),
      ).length,
    [allNotifications, readNotificationSet],
  );

  const selectedBookNotifications = useMemo(
    () =>
      selectedBook
        ? allNotifications.filter(
            (notification) => notification.bookId === selectedBook.id,
          )
        : [],
    [allNotifications, selectedBook],
  );

  const loading = pendingRequests > 0;
  const singleBookChaptersValid =
    singleBookForm.numberOfChapters.trim() !== '' &&
    Number.isInteger(Number(singleBookForm.numberOfChapters)) &&
    Number(singleBookForm.numberOfChapters) >= 1;
  const singleBookReady =
    singleBookForm.title.trim().length > 0 &&
    singleBookForm.notesOnOutlineBefore.trim().length > 0 &&
    singleBookChaptersValid;

  useEffect(() => {
    void refreshBooks(true);
  }, []);

  useEffect(() => {
    if (!selectedBook) {
      if (currentView === 'detail') {
        setCurrentView('dashboard');
      }
      return;
    }

    setOutlineStatus(selectedBook.statusOutlineNotes ?? 'no');
    setOutlineNotes(selectedBook.notesOnOutlineAfter ?? '');
    setFinalReviewStatus(selectedBook.finalReviewNotesStatus ?? 'no');
    setFinalReviewNotes(selectedBook.finalReviewNotes ?? '');
  }, [currentView, selectedBook]);

  useEffect(() => {
    if (!selectedBook?.chapters.length) {
      setActiveChapterNumber(null);
      return;
    }

    setActiveChapterNumber((current) => {
      if (
        current &&
        selectedBook.chapters.some(
          (chapter) => chapter.chapterNumber === current,
        )
      ) {
        return current;
      }

      return selectedBook.chapters[0]?.chapterNumber ?? null;
    });
  }, [selectedBook]);

  useEffect(() => {
    const activeNotificationIds = new Set(
      allNotifications.map((notification) => notification.id),
    );

    setReadNotificationIds((current) =>
      current.filter((notificationId) =>
        activeNotificationIds.has(notificationId),
      ),
    );
  }, [allNotifications]);

  useEffect(() => {
    if (!isNotificationPanelOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        notificationPanelRef.current &&
        !notificationPanelRef.current.contains(event.target as Node)
      ) {
        setIsNotificationPanelOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNotificationPanelOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isNotificationPanelOpen]);

  function pushToast(
    tone: ToastItem['tone'],
    title: string,
    message: string,
  ) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, title, message }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function markNotificationAsRead(notificationId: string) {
    setReadNotificationIds((current) =>
      current.includes(notificationId) ? current : [...current, notificationId],
    );
  }

  function markAllNotificationsAsRead() {
    setReadNotificationIds(allNotifications.map((notification) => notification.id));
  }

  function handleNotificationOpen(notification: NotificationItem) {
    markNotificationAsRead(notification.id);
    setSelectedBookId(notification.bookId);
    setCurrentView('detail');
    setIsNotificationPanelOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollToNotificationsSection() {
    setIsNotificationPanelOpen(false);
    window.setTimeout(() => {
      document
        .getElementById('notifications-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  async function withLoader<T>(message: string, task: () => Promise<T>) {
    setLoadingMessage(message);
    setPendingRequests((current) => current + 1);

    try {
      return await task();
    } finally {
      setPendingRequests((current) => Math.max(0, current - 1));
    }
  }

  async function refreshBooks(
    showLoader = false,
    preferredSelectedId?: string | null,
  ) {
    try {
      const nextBooks = showLoader
        ? await withLoader('Loading books from Supabase Storage...', () =>
            fetchBooks(),
          )
        : await fetchBooks();

      setBooks(nextBooks);
      setSelectedBookId((current) => {
        if (!nextBooks.length) {
          return null;
        }

        const nextSelectedId = preferredSelectedId ?? current;
        if (nextSelectedId && nextBooks.some((book) => book.id === nextSelectedId)) {
          return nextSelectedId;
        }

        return nextBooks[0]?.id ?? null;
      });
    } catch (error) {
      pushToast('error', 'Could not load books', getErrorMessage(error));
    }
  }

  async function runAction<T>(
    action: () => Promise<T>,
    successMessage: string,
    pendingMessage: string,
    options?: ActionOptions<T>,
  ) {
    try {
      const result = await withLoader(pendingMessage, action);

      if (!options?.skipRefresh) {
        await refreshBooks(
          false,
          options?.getNextSelectedId ? options.getNextSelectedId(result) : undefined,
        );
      }

      options?.onSuccess?.(result);
      pushToast('success', 'Done', successMessage);
      return result;
    } catch (error) {
      pushToast('error', 'Action failed', getErrorMessage(error));
      return null;
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setUploadFile(event.target.files?.[0] ?? null);
  }

  function updateSingleBookField(
    field: keyof SingleBookFormState,
    value: string,
  ) {
    setSingleBookForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSingleBookSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const file = buildSingleBookImportFile(singleBookForm);
    await runAction(
      () => uploadSpreadsheet(file),
      'Book saved to Supabase Storage.',
      'Saving your new book to Supabase Storage...',
      {
        getNextSelectedId: (result) => result.books[0]?.id ?? null,
        onSuccess: () => {
          setSingleBookForm(INITIAL_SINGLE_BOOK_FORM);
          setCurrentView('dashboard');
        },
      },
    );
  }

  async function handleSpreadsheetImport() {
    if (!uploadFile) {
      return;
    }

    await runAction(
      () => uploadSpreadsheet(uploadFile),
      'Spreadsheet imported into Supabase Storage.',
      'Importing your spreadsheet...',
      {
        getNextSelectedId: (result) => result.books[0]?.id ?? null,
        onSuccess: () => {
          setUploadFile(null);
          setCurrentView('dashboard');
        },
      },
    );
  }

  async function handleDownload(book: Book) {
    try {
      await withLoader('Preparing your PDF download...', () =>
        downloadBook(book.id, book.title),
      );
      pushToast('success', 'Download started', `${book.title} is downloading.`);
    } catch (error) {
      pushToast('error', 'Download failed', getErrorMessage(error));
    }
  }

  const detailView = currentView === 'detail' && selectedBook;

  return (
    <main className="app-shell">
      <LoadingOverlay isVisible={loading} message={loadingMessage} />
      <ToastCenter onClose={dismissToast} toasts={toasts} />
      <ConfirmDialog
        confirmLabel="Delete book"
        description={
          selectedBook
            ? `This will permanently remove "${selectedBook.title}", its chapters, notes, and downloaded file metadata from Supabase Storage.`
            : ''
        }
        isOpen={isDeleteDialogOpen}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (!selectedBook) {
            return;
          }

          setIsDeleteDialogOpen(false);
          void runAction(
            () => deleteBook(selectedBook.id),
            'Book deleted successfully.',
            'Removing the book from Supabase Storage...',
            {
              onSuccess: () => setCurrentView('dashboard'),
            },
          );
        }}
        title="Delete this book?"
      />

      <header className="topbar">
        <div className="brand-mark">
          <div className="brand-mark__logo brand-mark__logo--image">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 88" width="105" height="44">
              <text x="0" y="36" fontFamily="'Helvetica Neue', Arial, sans-serif" fontSize="34" fontWeight="900" fill="#111">media</text>
              <circle cx="170" cy="22" r="19" fill="none" stroke="#9B30FF" strokeWidth="3.5"/>
              <text x="170" y="30" fontFamily="'Helvetica Neue', Arial, sans-serif" fontSize="22" fontWeight="700" fill="#9B30FF" textAnchor="middle">@</text>
              <text x="0" y="80" fontFamily="'Helvetica Neue', Arial, sans-serif" fontSize="34" fontWeight="900" fill="#111">marsons</text>
            </svg>
          </div>
          <div>
            <h1>Automated Book Generator</h1>
            <p>Manage and organize all your books in one place</p>
          </div>
        </div>

        <div className="topbar__actions">
          <div className="notification-menu" ref={notificationPanelRef}>
            <button
              aria-expanded={isNotificationPanelOpen}
              aria-haspopup="dialog"
              aria-label="Open notifications"
              className={`notification-bell ${
                isNotificationPanelOpen ? 'notification-bell--open' : ''
              }`}
              onClick={() =>
                setIsNotificationPanelOpen((current) => !current)
              }
              type="button"
            >
              <BellIcon />
              {unreadNotificationCount ? (
                <span className="notification-bell__badge">
                  {Math.min(unreadNotificationCount, 5)}
                </span>
              ) : null}
            </button>

            {isNotificationPanelOpen ? (
              <section
                aria-label="Notifications"
                className="notification-popover"
              >
                <div className="notification-popover__header">
                  <div>
                    <h2>Notifications</h2>
                    <p>Stay updated with system alerts and activities</p>
                  </div>
                  <button
                    aria-label="Close notifications"
                    className="notification-popover__close"
                    onClick={() => setIsNotificationPanelOpen(false)}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>

                {latestNotifications.length ? (
                  <div className="notification-popover__list">
                    {latestNotifications.map((notification) => (
                      <NotificationCard
                        compact
                        isRead={readNotificationSet.has(notification.id)}
                        key={notification.id}
                        notification={notification}
                        onDismiss={markNotificationAsRead}
                        onOpen={handleNotificationOpen}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-inline-state notification-empty-state">
                    <p>No notifications yet.</p>
                  </div>
                )}

                <div className="notification-popover__footer">
                  <button
                    className="button button--soft"
                    onClick={scrollToNotificationsSection}
                    type="button"
                  >
                    See All Notifications
                  </button>
                </div>
              </section>
            ) : null}
          </div>

          <button
            className="button button--soft"
            onClick={() =>
              document
                .getElementById('book-creator')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            type="button"
          >
            + New Book
          </button>
          {detailView ? (
            <button
              className="button button--soft"
              onClick={() => setCurrentView('dashboard')}
              type="button"
            >
              Back to My Books
            </button>
          ) : null}
        </div>
      </header>

      {detailView ? (
        <section className="detail-page">
          <div className="detail-page__hero">
            <button
              className="link-button"
              onClick={() => setCurrentView('dashboard')}
              type="button"
            >
              ← Back to My Books
            </button>

            <div className="detail-page__hero-main">
              <div>
                <p className="section-label">Book Workspace</p>
                <h2>{selectedBook.title}</h2>
                <p className="muted-text">
                  Stored in Supabase Storage • Source:{' '}
                  {selectedBook.sourceFileName ?? 'Single-book form'}
                </p>
              </div>

              <div className="detail-page__hero-actions">
                <StatusBadge
                  label={formatStage(selectedBook.workflowStatus)}
                  tone={
                    selectedBook.bookOutputStatus === 'ready' ? 'success' : 'neutral'
                  }
                />
                <button
                  className="button button--danger"
                  disabled={loading}
                  onClick={() => setIsDeleteDialogOpen(true)}
                  type="button"
                >
                  Delete Book
                </button>
                <button
                  className="button button--secondary"
                  disabled={loading}
                  onClick={() =>
                    void runAction(
                      () => compileBook(selectedBook.id),
                      'Book compiled and uploaded for download.',
                      'Compiling your PDF and uploading it to Supabase Storage...',
                    )
                  }
                  type="button"
                >
                  Compile Book
                </button>
                <button
                  className="button"
                  disabled={loading || selectedBook.bookOutputStatus !== 'ready'}
                  onClick={() => void handleDownload(selectedBook)}
                  type="button"
                >
                  Download PDF
                </button>
              </div>
            </div>

            <div className="stats-grid stats-grid--detail">
              <article className="stat-card">
                <span>Outline Review</span>
                <strong>{formatReviewStatus(selectedBook.statusOutlineNotes)}</strong>
              </article>
              <article className="stat-card stat-card--accent">
                <span>Download Status</span>
                <strong>{formatStage(selectedBook.bookOutputStatus)}</strong>
              </article>
              <article className="stat-card">
                <span>Total Chapters</span>
                <strong>{selectedBook.chapters.length}</strong>
              </article>
              <article className="stat-card">
                <span>Last Updated</span>
                <strong>{formatDateTime(selectedBook.updatedAt)}</strong>
              </article>
            </div>
          </div>

          <div className="detail-layout">
            <section className="detail-stack">
              <article className="detail-card">
                <div className="detail-card__header">
                  <div>
                    <p className="section-label">Stage 1</p>
                    <h3>Outline generation</h3>
                  </div>
                  <StatusBadge
                    label={formatReviewStatus(selectedBook.statusOutlineNotes)}
                    tone={
                      selectedBook.statusOutlineNotes === 'no_notes_needed'
                        ? 'success'
                        : 'warning'
                    }
                  />
                </div>

                <p className="muted-text">{selectedBook.notesOnOutlineBefore}</p>

                <div className="detail-card__actions">
                  <button
                    className="button button--secondary"
                    disabled={loading}
                    onClick={() =>
                      void runAction(
                        () => generateOutline(selectedBook.id),
                        'Outline generation completed.',
                        'Generating the outline with AI...',
                      )
                    }
                    type="button"
                  >
                    {selectedBook.outlineText ? 'Regenerate Outline' : 'Generate Outline'}
                  </button>
                </div>

                <div className="field-grid">
                  <label className="field">
                    <span>Outline review status</span>
                    <select
                      disabled={loading}
                      value={outlineStatus}
                      onChange={(event) => setOutlineStatus(event.target.value)}
                    >
                      {REVIEW_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Outline review notes</span>
                    <textarea
                      disabled={loading}
                      rows={4}
                      value={outlineNotes}
                      onChange={(event) => setOutlineNotes(event.target.value)}
                      placeholder="Add outline review notes here."
                    />
                  </label>
                </div>

                <button
                  className="button"
                  disabled={loading}
                  onClick={() =>
                    void runAction(
                      () =>
                        updateOutlineReview(selectedBook.id, {
                          statusOutlineNotes: outlineStatus,
                          notesOnOutlineAfter: outlineNotes,
                        }),
                      'Outline review saved.',
                      'Saving outline review...',
                    )
                  }
                  type="button"
                >
                  Save outline review
                </button>

                <div className="detail-preview">
                  <h4>Outline Preview</h4>
                  <pre>
                    {selectedBook.outlineText ??
                      'Generate the outline to preview the chapter plan.'}
                  </pre>
                </div>
              </article>

              <article className="detail-card">
                <div className="detail-card__header">
                  <div>
                    <p className="section-label">Stage 2</p>
                    <h3>Chapters</h3>
                  </div>
                  <StatusBadge
                    label={
                      activeChapter
                        ? `Chapter ${activeChapter.chapterNumber}`
                        : 'No chapters'
                    }
                  />
                </div>

                {selectedBook.chapters.length ? (
                  <>
                    <div className="chapter-tabs">
                      {selectedBook.chapters.map((chapter) => (
                        <button
                          className={`chapter-tab ${
                            activeChapterNumber === chapter.chapterNumber
                              ? 'chapter-tab--active'
                              : ''
                          }`}
                          key={chapter.id}
                          onClick={() => setActiveChapterNumber(chapter.chapterNumber)}
                          type="button"
                        >
                          Chapter {chapter.chapterNumber}
                        </button>
                      ))}
                    </div>

                    {activeChapter ? (
                      <ChapterCard
                        chapter={activeChapter}
                        disabled={loading}
                        onGenerate={async (chapterNumber) => {
                          await runAction(
                            () => generateChapter(selectedBook.id, chapterNumber),
                            `Chapter ${chapterNumber} generated.`,
                            `Generating chapter ${chapterNumber}...`,
                          );
                        }}
                        onSaveReview={async (chapterNumber, payload) => {
                          await runAction(
                            () =>
                              updateChapterReview(
                                selectedBook.id,
                                chapterNumber,
                                payload,
                              ),
                            `Chapter ${chapterNumber} review saved.`,
                            `Saving chapter ${chapterNumber} review...`,
                          );
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="empty-state">
                    <p>No chapters yet. Generate the outline first.</p>
                  </div>
                )}
              </article>
            </section>

            <aside className="detail-sidebar">
              <article className="detail-card">
                <div className="detail-card__header">
                  <div>
                    <p className="section-label">Stage 3</p>
                    <h3>Final review</h3>
                  </div>
                  <StatusBadge
                    label={formatStage(selectedBook.bookOutputStatus)}
                    tone={
                      selectedBook.bookOutputStatus === 'ready'
                        ? 'success'
                        : 'warning'
                    }
                  />
                </div>

                <label className="field">
                  <span>Final review status</span>
                  <select
                    disabled={loading}
                    value={finalReviewStatus}
                    onChange={(event) => setFinalReviewStatus(event.target.value)}
                  >
                    {REVIEW_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Final review notes</span>
                  <textarea
                    disabled={loading}
                    rows={5}
                    value={finalReviewNotes}
                    onChange={(event) => setFinalReviewNotes(event.target.value)}
                    placeholder="Add final editorial guidance or approval notes."
                  />
                </label>

                <div className="detail-card__actions">
                  <button
                    className="button button--secondary"
                    disabled={loading}
                    onClick={() =>
                      void runAction(
                        () =>
                          updateFinalReview(selectedBook.id, {
                            finalReviewNotesStatus: finalReviewStatus,
                            finalReviewNotes,
                          }),
                        'Final review saved.',
                        'Saving final review...',
                      )
                    }
                    type="button"
                  >
                    Save final review
                  </button>
                  <button
                    className="button"
                    disabled={loading || selectedBook.bookOutputStatus !== 'ready'}
                    onClick={() => void handleDownload(selectedBook)}
                    type="button"
                  >
                    Download PDF
                  </button>
                </div>
              </article>

              <article className="detail-card">
                <div className="detail-card__header">
                  <div>
                    <p className="section-label">Notifications</p>
                    <h3>Recent alerts</h3>
                  </div>
                </div>

                {selectedBookNotifications.length ? (
                  <div className="notification-feed notification-feed--stacked">
                    {selectedBookNotifications.slice(0, 5).map((notification) => (
                      <NotificationCard
                        compact
                        isRead={readNotificationSet.has(notification.id)}
                        key={notification.id}
                        notification={notification}
                        onOpen={handleNotificationOpen}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-inline-state notification-empty-state">
                    <p>No notifications for this book yet.</p>
                  </div>
                )}
              </article>
            </aside>
          </div>
        </section>
      ) : (
        <>
          <section className="dashboard-hero">
            <div className="stats-grid">
              <article className="stat-card">
                <span>Total Books</span>
                <strong>{books.length}</strong>
              </article>
              <article className="stat-card">
                <span>Total Chapters</span>
                <strong>{totalChapters}</strong>
              </article>
              <article className="stat-card">
                <span>Total Words</span>
                <strong>{formatNumber(totalWords)}</strong>
              </article>
            </div>
          </section>

          <section className="creator-panel" id="book-creator">
            <div className="creator-panel__header">
              <div>
                <p className="section-label">New Book</p>
                <h2>Create a book or import a spreadsheet</h2>
              </div>

              <div className="mode-toggle" role="tablist" aria-label="Book creation mode">
                <button
                  aria-selected={intakeMode === 'single'}
                  className={`mode-toggle__button ${
                    intakeMode === 'single' ? 'mode-toggle__button--active' : ''
                  }`}
                  onClick={() => setIntakeMode('single')}
                  type="button"
                >
                  Type Book
                </button>
                <button
                  aria-selected={intakeMode === 'upload'}
                  className={`mode-toggle__button ${
                    intakeMode === 'upload' ? 'mode-toggle__button--active' : ''
                  }`}
                  onClick={() => setIntakeMode('upload')}
                  type="button"
                >
                  Upload File
                </button>
              </div>
            </div>

            {intakeMode === 'single' ? (
              <form className="creator-form" onSubmit={handleSingleBookSubmit}>
                <div className="field-grid">
                  <label className="field">
                    <span>Book Title</span>
                    <input
                      placeholder="Lead Magnet in 10 Minutes"
                      value={singleBookForm.title}
                      onChange={(event) =>
                        updateSingleBookField('title', event.target.value)
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Number of Chapters</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="e.g. 10"
                      value={singleBookForm.numberOfChapters}
                      onChange={(event) =>
                        updateSingleBookField(
                          'numberOfChapters',
                          event.target.value,
                        )
                      }
                    />
                    {singleBookForm.numberOfChapters !== '' &&
                      !singleBookChaptersValid && (
                        <span className="field__error">
                          At least 1 chapter is required.
                        </span>
                      )}
                  </label>
                </div>

                <div className="field-grid">
                  <label className="field">
                    <span>Outline Notes Status</span>
                    <select
                      value={singleBookForm.statusOutlineNotes}
                      onChange={(event) =>
                        updateSingleBookField(
                          'statusOutlineNotes',
                          event.target.value,
                        )
                      }
                    >
                      {REVIEW_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>Outline Brief</span>
                  <textarea
                    placeholder="Describe the audience, promise, and shape of the book."
                    rows={4}
                    value={singleBookForm.notesOnOutlineBefore}
                    onChange={(event) =>
                      updateSingleBookField(
                        'notesOnOutlineBefore',
                        event.target.value,
                      )
                    }
                  />
                </label>

                <div className="field-grid">
                  <label className="field">
                    <span>Outline Review Notes</span>
                    <textarea
                      placeholder="Optional notes to apply after outline generation."
                      rows={3}
                      value={singleBookForm.notesOnOutlineAfter}
                      onChange={(event) =>
                        updateSingleBookField(
                          'notesOnOutlineAfter',
                          event.target.value,
                        )
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Final Review Notes</span>
                    <textarea
                      placeholder="Optional final review guidance."
                      rows={3}
                      value={singleBookForm.finalReviewNotes}
                      onChange={(event) =>
                        updateSingleBookField(
                          'finalReviewNotes',
                          event.target.value,
                        )
                      }
                    />
                  </label>
                </div>

                <div className="creator-form__actions">
                  <button
                    className="button button--secondary"
                    disabled={!singleBookReady || loading}
                    type="submit"
                  >
                    Save Book
                  </button>
                </div>
              </form>
            ) : (
              <div className="upload-pane">
                <label className="upload-dropzone">
                  <input
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    type="file"
                  />
                  <span className="upload-dropzone__title">
                    Upload CSV or Excel for multiple books
                  </span>
                  <span className="upload-dropzone__copy">
                    One row creates one book. Required columns: <code>title</code>, <code>number_of_chapters</code> (min 1), <code>notes_on_outline_before</code>.
                  </span>
                  <strong>{uploadFile?.name ?? 'No file selected yet'}</strong>
                </label>

                <button
                  className="button button--secondary"
                  disabled={!uploadFile || loading}
                  onClick={() => void handleSpreadsheetImport()}
                  type="button"
                >
                  Import File
                </button>
              </div>
            )}
          </section>

          <section className="books-panel">
            <div className="books-panel__header">
              <div>
                <p className="section-label">Your Ebooks</p>
                <h2>Open a book to manage its workflow and downloads</h2>
              </div>
              <span className="books-panel__count">
                {filteredBooks.length} shown
              </span>
            </div>

            {filteredBooks.length ? (
              <div className="book-grid">
                {filteredBooks.map((book, index) => (
                  <article className="book-card" key={book.id}>
                    <div
                      className="book-card__cover"
                      style={{
                        background:
                          COVER_GRADIENTS[index % COVER_GRADIENTS.length],
                      }}
                    >
                      <span className="book-card__badge">
                        {index === 0 ? 'Most Recent' : formatStage(book.workflowStatus)}
                      </span>
                    </div>

                    <div className="book-card__body">
                      <div className="book-card__header">
                        <div>
                          <h3>{book.title}</h3>
                          <p>{book.sourceFileName ?? 'Single-book form'}</p>
                        </div>
                        <StatusBadge
                          label={
                            book.bookOutputStatus === 'ready'
                              ? 'Download Ready'
                              : formatStage(book.bookOutputStatus)
                          }
                          tone={
                            book.bookOutputStatus === 'ready'
                              ? 'success'
                              : 'neutral'
                          }
                        />
                      </div>

                      <div className="book-card__meta">
                        <span>{book.chapters.length} chapters</span>
                        <span>{formatNumber(countBookWords(book))} words</span>
                        <span>{formatDateTime(book.updatedAt)}</span>
                      </div>

                      <div className="book-card__actions">
                        {book.bookOutputStatus === 'ready' ? (
                          <button
                            className="button button--soft"
                            onClick={() => void handleDownload(book)}
                            type="button"
                          >
                            Download
                          </button>
                        ) : null}
                        <button
                          className="button"
                          onClick={() => {
                            setSelectedBookId(book.id);
                            setCurrentView('detail');
                          }}
                          type="button"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No books match your search yet.</p>
              </div>
            )}
          </section>
        </>
      )}

      <section className="notifications-screen" id="notifications-section">
        <div className="notifications-screen__header">
          <div>
            <h2>Notifications</h2>
            <p>Stay updated with system alerts and activities</p>
          </div>

          <button
            className="button button--soft notification-mark-read"
            disabled={!totalUnreadNotificationCount}
            onClick={markAllNotificationsAsRead}
            type="button"
          >
            <CheckIcon />
            Mark All as Read
          </button>
        </div>

        <div className="notifications-screen__subheader">
          <h3>Latest workflow activity</h3>
          <span>{allNotifications.length} total notifications</span>
        </div>

        {allNotifications.length ? (
          <div className="notification-feed">
            {allNotifications.map((notification) => (
              <NotificationCard
                isRead={readNotificationSet.has(notification.id)}
                key={notification.id}
                notification={notification}
                onOpen={handleNotificationOpen}
              />
            ))}
          </div>
        ) : (
          <div className="empty-inline-state notification-empty-state notification-empty-state--page">
            <p>Your workflow notifications will appear here.</p>
          </div>
        )}
      </section>
    </main>
  );
}

interface NotificationCardProps {
  compact?: boolean;
  isRead: boolean;
  notification: NotificationItem;
  onDismiss?: (notificationId: string) => void;
  onOpen: (notification: NotificationItem) => void;
}

function NotificationCard({
  compact = false,
  isRead,
  notification,
  onDismiss,
  onOpen,
}: NotificationCardProps) {
  const cardClassName = [
    'notification-card',
    compact ? 'notification-card--compact' : '',
    isRead ? 'notification-card--read' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardClassName}>
      <div className="notification-card__status">
        <span className="notification-card__status-icon">
          <CheckIcon />
        </span>
      </div>

      <div className="notification-card__body">
        <div className="notification-card__header">
          <div>
            <h4>{formatStage(notification.type)}</h4>
            <p className="notification-card__book">{notification.bookTitle}</p>
          </div>

          <div className="notification-card__header-side">
            <span className="notification-card__time">
              {formatRelativeTime(notification.createdAt)}
            </span>
            {onDismiss ? (
              <button
                aria-label="Mark notification as read"
                className="notification-card__dismiss"
                onClick={() => onDismiss(notification.id)}
                type="button"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
        </div>

        <p className="notification-card__message">{notification.message}</p>

        <div className="notification-card__meta">
          <span>{notification.sourceFileName ?? 'Single-book form'}</span>
          <span>{notification.chapterCount} chapters</span>
          <span>{formatDateTime(notification.createdAt)}</span>
        </div>

        <div className="notification-card__footer">
          <button
            className="notification-card__link"
            onClick={() => onOpen(notification)}
            type="button"
          >
            View Details
            <ArrowRightIcon />
          </button>
        </div>
      </div>
    </article>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M15 18H9m10-1H5l1.58-1.76A2 2 0 0 0 7 13.91V10a5 5 0 1 1 10 0v3.91c0 .49.18.96.51 1.33L19 17Zm-9 1a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m7.5 12.5 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M7 7 17 17M17 7 7 17"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function buildSingleBookImportFile(form: SingleBookFormState) {
  const rows = [
    [
      'title',
      'number_of_chapters',
      'notes_on_outline_before',
      'notes_on_outline_after',
      'status_outline_notes',
      'final_review_notes_status',
      'final_review_notes',
    ],
    [
      form.title,
      form.numberOfChapters,
      form.notesOnOutlineBefore,
      form.notesOnOutlineAfter,
      form.statusOutlineNotes,
      form.finalReviewNotesStatus,
      form.finalReviewNotes,
    ],
  ];

  const csv = rows
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  return new File([csv], `${toFileSlug(form.title || 'book')}.csv`, {
    type: 'text/csv;charset=utf-8',
  });
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
}

function toFileSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const elapsedSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'auto',
  });

  let duration = elapsedSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }

    duration /= division.amount;
  }

  return formatter.format(Math.round(duration), 'year');
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function countBookWords(book: Book) {
  return book.chapters.reduce(
    (sum, chapter) => sum + countWords(chapter.content ?? ''),
    0,
  );
}

function countWords(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export default App;
