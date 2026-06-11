import type { AccountSummary, LauncherSettings, ServiceId } from '@shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowDownUp, Check, ListFilter, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { labelColors } from '~/lib/labelColor';
import {
  isStreamService,
  mergeWithStream,
  startAccountsStream,
  useAccountsStream,
} from '~/stores/accountsStream';
import { useProfileLabels } from '~/stores/profileLabels';
import { useSettings } from '~/stores/settings';
import { Modal } from '~/widgets/Modal/Modal';
import { AccountCard } from './AccountCard';
import { SkeletonCard } from './InventorySkeleton';
import s from './InventoryView.module.scss';

const CHUNK = 24;

const SKELETON_INITIAL = 8;
const SKELETON_TAIL = 4;

const SUPPORTED_SERVICES = [
  'steam',
  'telegram',
  'tiktok',
  'instagram',
  'discord',
] as const satisfies readonly ServiceId[];
type SupportedService = (typeof SUPPORTED_SERVICES)[number];
const isSupportedService = (id: ServiceId | null): id is SupportedService =>
  id !== null && (SUPPORTED_SERVICES as readonly string[]).includes(id);

const SERVICE_LABELS: Record<SupportedService, string> = {
  steam: 'Steam',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  discord: 'Discord',
};

type Filter = ServiceId | 'all';

type SortKey = 'purchased' | 'price' | 'warranty';
type SortDir = 'asc' | 'desc';

const SORT_KEYS: readonly SortKey[] = ['purchased', 'price', 'warranty'] as const;

const INVALID_TAG_ID = 2;
const isInvalidAccount = (item: AccountSummary): boolean =>
  item.tags.some((tag) => tag.id === INVALID_TAG_ID);

const searchHaystack = (item: AccountSummary): string => {
  const parts: (string | null | undefined)[] = [
    item.title,
    item.categoryTitle,
    item.steam?.country,
    item.telegram?.country,
    item.telegram?.username,
    item.telegram?.phone,
    ...(item.steam?.games.map((g) => g.title) ?? []),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
};

const matchesQuery = (item: AccountSummary, query: string): boolean => {
  if (!query) return true;
  const haystack = searchHaystack(item);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
};

const sortValue = (item: AccountSummary, key: SortKey): number | null => {
  switch (key) {
    case 'purchased':
      return item.purchasedAt;
    case 'price':
      return item.price;
    case 'warranty':
      return item.warrantyEndsAt;
  }
};

const compareItems = (a: AccountSummary, b: AccountSummary, key: SortKey, dir: SortDir): number => {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  return dir === 'asc' ? va - vb : vb - va;
};

interface Bucket {
  id: Filter;
  label: string;
  count: number;
  loading: boolean;
}

const buildBuckets = (
  items: AccountSummary[],
  allLabel: string,
  loaded: ReadonlySet<SupportedService>,
  streaming: boolean,
): Bucket[] => {
  const counts = new Map<SupportedService, number>();
  for (const item of items) {
    if (isSupportedService(item.category)) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const allDone = SUPPORTED_SERVICES.every((id) => loaded.has(id));
  const buckets: Bucket[] = [
    { id: 'all', label: allLabel, count: total, loading: streaming && !allDone },
  ];
  for (const id of SUPPORTED_SERVICES) {
    buckets.push({
      id,
      label: SERVICE_LABELS[id],
      count: counts.get(id) ?? 0,
      loading: !loaded.has(id),
    });
  }
  return buckets;
};

export const InventoryView = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const loadLabels = useProfileLabels((p) => p.load);
  const labels = useProfileLabels((p) => p.labels);
  // Load the label palette once so card chips can render in their colours.
  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);
  const [filter, setFilter] = useState<Filter>('all');
  const [labelFilter, setLabelFilter] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(CHUNK);
  const streaming = useAccountsStream((st) => st.streaming);
  const loaded = useAccountsStream((st) => st.loaded);
  const settings = useSettings((st) => st.settings);
  const setSettings = useSettings((st) => st.set);
  const hideInvalid = settings?.inventoryHideInvalid ?? false;
  const sortKey = settings?.inventorySortKey ?? 'purchased';
  const sortDir = settings?.inventorySortDir ?? 'desc';
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtersActive =
    hideInvalid || sortKey !== 'purchased' || sortDir !== 'desc' || labelFilter !== null;

  const persistSettings = async (patch: Partial<LauncherSettings>) => {
    const next = await window.launcher.settings.set(patch);
    setSettings(next.settings);
  };

  const setSortKey = (key: SortKey) => void persistSettings({ inventorySortKey: key });
  const setSortDir = (dir: SortDir) => void persistSettings({ inventorySortDir: dir });
  const toggleHideInvalid = () => void persistSettings({ inventoryHideInvalid: !hideInvalid });
  // A label may disappear from the palette (deleted on web) while still selected
  // — clear the filter then so the list doesn't stay mysteriously empty.
  useEffect(() => {
    if (labelFilter !== null && !labels.some((l) => l.id === labelFilter)) setLabelFilter(null);
  }, [labels, labelFilter]);

  const resetFilters = () => {
    setLabelFilter(null);
    void persistSettings({
      inventoryHideInvalid: false,
      inventorySortKey: 'purchased',
      inventorySortDir: 'desc',
    });
  };

  const query = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => mergeWithStream(await window.launcher.accounts.list()),
    staleTime: 60_000,
  });

  const rawItems = query.data ?? [];
  const items = useMemo(() => rawItems.filter((it) => isSupportedService(it.category)), [rawItems]);
  const buckets = useMemo(
    () => buildBuckets(items, t('inventory.filter.all'), loaded, streaming),
    [items, t, loaded, streaming],
  );

  const trimmedSearch = search.trim();
  const visible = useMemo(() => {
    const filtered = items.filter(
      (it) =>
        (filter === 'all' || it.category === filter) &&
        (!hideInvalid || !isInvalidAccount(it)) &&
        (labelFilter === null || it.tags.some((tg) => tg.id === labelFilter)) &&
        matchesQuery(it, trimmedSearch),
    );
    return [...filtered].sort((a, b) => compareItems(a, b, sortKey, sortDir));
  }, [items, filter, hideInvalid, labelFilter, trimmedSearch, sortKey, sortDir]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are the filter inputs — reset paging whenever any of them changes
  useEffect(() => {
    setLimit(CHUNK);
    document.querySelector('[data-scroll-root]')?.scrollTo({ top: 0 });
  }, [filter, hideInvalid, labelFilter, trimmedSearch, sortKey, sortDir]);

  const shown = visible.slice(0, limit);
  const hasMore = limit < visible.length;

  const allDone = SUPPORTED_SERVICES.every((id) => loaded.has(id));
  const activeLoading =
    filter === 'all' ? streaming && !allDone : isSupportedService(filter) && !loaded.has(filter);

  const fullySettled = !streaming && !query.isLoading && !query.isFetching;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `visible.length` re-arms the observer when streamed items land while the sentinel is already in view
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLimit((n) => n + CHUNK);
        }
      },
      { root: node.closest('[data-scroll-root]'), rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visible.length]);

  const refresh = () => {
    if (streaming) return;
    // On a single-category tab, refresh only that category; on "all", refresh everything.
    const only = filter !== 'all' && isStreamService(filter) ? filter : undefined;
    startAccountsStream(only);
    // The profile (balance/currency) may also have changed on the web — refetch
    // it so the top bar reflects a currency switched outside the launcher.
    void qc.invalidateQueries({ queryKey: ['auth-status'] });
  };

  // Hard error with nothing cached to fall back on.
  if (query.isError && rawItems.length === 0) {
    return (
      <div className={s.state}>
        <AlertCircle size={28} className={s.danger} />
        <p>{t('inventory.error')}</p>
        <button type="button" className={s.retry} onClick={() => query.refetch()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (rawItems.length === 0 && fullySettled) {
    return (
      <div className={s.state}>
        <p>{t('inventory.empty')}</p>
        <button
          type="button"
          className={s.retry}
          onClick={() => window.launcher.app.openExternal('https://lzt.market/orders')}
        >
          {t('inventory.openMarket')}
        </button>
      </div>
    );
  }

  if (items.length === 0 && fullySettled) {
    return (
      <div className={s.state}>
        <p>{t('inventory.emptyUnsupported')}</p>
        <button
          type="button"
          className={s.retry}
          onClick={() => window.launcher.app.openExternal('https://lzt.market/orders')}
        >
          {t('inventory.openMarket')}
        </button>
      </div>
    );
  }

  return (
    <div className={s.view}>
      <div className={s.toolbar}>
        <div className={s.filters}>
          {buckets.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`${s.filter} ${filter === b.id ? s.filterActive : ''}`}
              onClick={() => setFilter(b.id)}
            >
              <span>{b.label}</span>
              {b.loading ? (
                <span className={s.filterCountSkeleton} aria-hidden />
              ) : (
                <span className={s.filterCount}>{b.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={s.controls}>
        <div className={s.searchBox}>
          <Search size={15} className={s.searchIcon} />
          <input
            type="text"
            className={s.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inventory.searchPlaceholder')}
          />
          {search && (
            <button
              type="button"
              className={s.searchClear}
              onClick={() => setSearch('')}
              aria-label={t('inventory.searchClear')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className={s.controlsActions}>
          <button type="button" className={s.refresh} onClick={refresh} disabled={streaming}>
            <RefreshCw size={14} className={streaming ? s.spin : ''} />
            <span>{t('inventory.refresh')}</span>
          </button>
          <button
            type="button"
            className={`${s.filterBtn} ${filtersActive ? s.filterBtnActive : ''}`}
            onClick={() => setFilterOpen(true)}
            aria-haspopup="dialog"
          >
            <ListFilter size={15} />
            <span>{t('inventory.filters.title')}</span>
            {filtersActive && <span className={s.filterDot} aria-hidden />}
          </button>
        </div>
      </div>

      {filterOpen && (
        <Modal title={t('inventory.filters.title')} onClose={() => setFilterOpen(false)}>
          <div className={s.filterModal}>
            <div className={s.filterGroup}>
              <span className={s.filterGroupLabel}>{t('inventory.filters.sortLabel')}</span>
              <div className={s.sortRow}>
                <div className={s.sortKeys}>
                  {SORT_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`${s.sortBtn} ${sortKey === key ? s.sortBtnActive : ''}`}
                      onClick={() => setSortKey(key)}
                    >
                      {t(`inventory.sort.${key}`)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={s.sortDir}
                  onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                >
                  <ArrowDownUp size={14} />
                  <span>{t(sortDir === 'asc' ? 'inventory.sort.asc' : 'inventory.sort.desc')}</span>
                </button>
              </div>
            </div>

            {labels.length > 0 && (
              <div className={s.filterGroup}>
                <span className={s.filterGroupLabel}>{t('inventory.filters.labelLabel')}</span>
                <div className={s.labelChips}>
                  {labels.map((label) => {
                    const on = labelFilter === label.id;
                    const c = labelColors(label.bc);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        className={`${s.labelChip} ${on ? s.labelChipOn : ''}`}
                        style={
                          on
                            ? {
                                backgroundColor: c.background,
                                color: c.text,
                                borderColor: c.background,
                              }
                            : undefined
                        }
                        onClick={() => setLabelFilter(on ? null : label.id)}
                        aria-pressed={on}
                      >
                        {on && <Check size={13} />}
                        <span>{label.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              role="checkbox"
              aria-checked={hideInvalid}
              className={s.filterOption}
              onClick={() => void toggleHideInvalid()}
            >
              <span className={`${s.checkbox} ${hideInvalid ? s.checkboxOn : ''}`}>
                {hideInvalid && <Check size={12} />}
              </span>
              <span>{t('inventory.filters.hideInvalid')}</span>
            </button>
            <button
              type="button"
              className={s.filterReset}
              onClick={() => void resetFilters()}
              disabled={!filtersActive}
            >
              {t('inventory.filters.reset')}
            </button>
          </div>
        </Modal>
      )}

      {visible.length === 0 && activeLoading ? (
        <div className={s.grid}>
          {Array.from({ length: SKELETON_INITIAL }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className={s.noResults}>
          <Search size={24} className={s.noResultsIcon} />
          <p>{t('inventory.noResults')}</p>
        </div>
      ) : (
        <div key={filter} className={s.grid}>
          {shown.map((item) => (
            <AccountCard key={item.itemId} item={item} />
          ))}
          {!hasMore &&
            activeLoading &&
            Array.from({ length: SKELETON_TAIL }, (_, i) => <SkeletonCard key={`tail-${i}`} />)}
        </div>
      )}

      {hasMore && <div ref={sentinelRef} className={s.sentinel} aria-hidden />}
    </div>
  );
};
