export function ok(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, data, message });
}

export function created(res, data = null, message = 'Created') {
  return ok(res, data, message, 201);
}

export function paginated(res, items, { page, limit, total }, message = 'OK') {
  return ok(
    res,
    {
      items,
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      hasNext: page * limit < total
    },
    message
  );
}

export function paginationMeta({ page = 1, limit = 20, total = 0 }) {
  return { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 };
}

export default { ok, created, paginated, paginationMeta };
