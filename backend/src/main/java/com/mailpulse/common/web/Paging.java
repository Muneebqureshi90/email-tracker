package com.mailpulse.common.web;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** The page rule of every paged endpoint (docs/v2-contract.md, Pagination): page from 0, size 25, 50 or 100. */
public final class Paging {

    public static final Set<Integer> SIZES = Set.of(25, 50, 100);

    private Paging() {}

    public static void check(int page, int size) {
        if (page < 0 || !SIZES.contains(size)) {
            throw ApiException.badRequest("page must be >= 0 and size 25, 50 or 100");
        }
    }

    /** One page of a list that is already filtered and sorted in memory. */
    public static <T> List<T> slice(List<T> all, int page, int size) {
        int start = (int) Math.min(all.size(), (long) page * size);
        return List.copyOf(all.subList(start, Math.min(all.size(), start + size)));
    }

    /** asc or desc (default desc); anything else is a 400. */
    public static boolean ascending(String dir) {
        if (dir == null || dir.isBlank() || "desc".equals(dir)) {
            return false;
        }
        if ("asc".equals(dir)) {
            return true;
        }
        throw ApiException.badRequest("dir must be asc or desc");
    }

    public static <T> Comparator<T> direction(Comparator<T> ascending, boolean asc) {
        return asc ? ascending : ascending.reversed();
    }
}
