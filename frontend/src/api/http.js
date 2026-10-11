import axios from 'axios';

// Absolute on purpose: the API shares no prefix with the page routes, so a
// relative baseURL would collide with /tests, /admin, etc.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const http = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

/** Single place that turns network errors into toasts, so no component repeats it. */
let notify = () => {};
export const setNetworkNotifier = (fn) => {
  notify = fn;
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const isApiError = status !== undefined;

    if (status === 401) {
      // Let AuthContext clear the user, but not on the login call itself: a wrong
      // password is also a 401 and must stay on the page.
      if (!error.config?.url?.includes('/auth/login')) onUnauthorized();
    } else if (!isApiError) {
      notify('Connection problem. Your answers are saved locally and will retry.');
    }

    return Promise.reject(error);
  }
);

export default http;