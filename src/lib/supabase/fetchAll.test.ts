import { describe, expect, it } from "vitest";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

function makePages(total: number) {
  return Array.from({ length: total }, (_, i) => ({ id: i }));
}

describe("fetchAllRows", () => {
  it("returns a single short page directly", async () => {
    const rows = makePages(3);
    const { data, error } = await fetchAllRows(
      async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
      10,
    );
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
  });

  it("pages past the page-size boundary", async () => {
    const rows = makePages(25);
    let calls = 0;
    const { data, error } = await fetchAllRows(
      async (from, to) => {
        calls += 1;
        return { data: rows.slice(from, to + 1), error: null };
      },
      10,
    );
    expect(error).toBeNull();
    expect(data).toHaveLength(25);
    expect(data[24]).toEqual({ id: 24 });
    expect(calls).toBe(3);
  });

  it("stops after an exact multiple with one extra empty page", async () => {
    const rows = makePages(20);
    const { data } = await fetchAllRows(
      async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
      10,
    );
    expect(data).toHaveLength(20);
  });

  it("propagates errors and stops paging", async () => {
    const { data, error } = await fetchAllRows<{ id: number }>(
      async () => ({ data: null, error: { message: "boom" } }),
      10,
    );
    expect(error?.message).toBe("boom");
    expect(data).toHaveLength(0);
  });
});
