/**
 * ARKA — HTTP response helpers
 *
 * Every controller previously repeated
 *   `res.status(500).json({ success: false, error: err.message })`.
 * These helpers keep the API error shape identical everywhere.
 */

/** 500 (or custom status) JSON error response. */
export function fail(res, error, status = 500) {
  const message = error instanceof Error ? error.message : String(error || 'Kesalahan server internal');
  return res.status(status).json({ success: false, error: message });
}

/** 400 validation error. */
export function badRequest(res, message) {
  return res.status(400).json({ success: false, error: message });
}

/** 404 not-found error. */
export function notFound(res, message = 'Tidak ditemukan') {
  return res.status(404).json({ success: false, error: message });
}

/** 200/201 JSON success response. */
export function ok(res, payload = {}, status = 200) {
  return res.status(status).json({ success: true, ...payload });
}

/** Wrap a synchronous controller body so thrown errors become clean JSON. */
export function guard(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(err => fail(res, err));
    } catch (err) {
      fail(res, err);
    }
  };
}

export default { fail, badRequest, notFound, ok, guard };
