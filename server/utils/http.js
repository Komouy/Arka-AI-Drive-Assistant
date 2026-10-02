/**
 * ARKA — HTTP response helpers
 *
 * Every controller previously repeated
 *   `res.status(500).json({ success: false, error: err.message })`.
 * These helpers keep the API error shape identical everywhere.
 */

export function fail(res, error, status = 500) {
  let message = 'Kesalahan server internal';
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object') {
    message = error.message || error.details || error.hint || error.error_description || (error.code ? `Database error [${error.code}]` : JSON.stringify(error));
  }
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
