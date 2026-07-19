type PageResult<T> = { data: T[] | null; error: { message: string } | null };

// Supabase/PostgREST caps a single response (1000 rows by default), which would
// silently truncate large tables. This pages through .range() windows until a
// short page signals the end.
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return { data: all, error: null };
  }
}
