import * as SecureStore from "expo-secure-store";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000/api";

async function request(path: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync("access_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API request failed");
  return data;
}

export const mobileApi = {
  loginWithEmailOtp: (identifier: string, password: string, role: string) =>
    request("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ identifier, password, role }),
    }),
  verifyEmailOtp: (email: string, role: string, code: string) =>
    request("/auth/verify-otp/", {
      method: "POST",
      body: JSON.stringify({ email, role, code }),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request("/auth/change-password/", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  listGrievances: (scope: "assigned" | "all" = "assigned") =>
    request(`/grievances/${scope === "all" ? "?scope=all" : ""}`),
  checkNearbyDuplicate: (lat: number, lng: number, categoryId: number) =>
    request(`/grievances/nearby/?lat=${lat}&lng=${lng}&categoryId=${categoryId}`),
  createGrievance: (payload: Record<string, unknown>) =>
    request("/grievances/", { method: "POST", body: JSON.stringify(payload) }),
  upvoteGrievance: (id: number) =>
    request(`/grievances/${id}/upvote/`, { method: "POST" }),
  addComment: (id: number, message: string) =>
    request(`/grievances/${id}/comments/`, { method: "POST", body: JSON.stringify({ message }) }),
  reopenGrievance: (id: number, reason: string) =>
    request(`/grievances/${id}/reopen/`, { method: "POST", body: JSON.stringify({ reason }) }),
  rateGrievance: (id: number, rating: number, feedback = "") =>
    request(`/grievances/${id}/rate/`, { method: "POST", body: JSON.stringify({ rating, feedback }) }),
  updateGrievanceStatus: (id: number, status: string, remarks: string, field_photo_urls: string[] = []) =>
    request(`/grievances/${id}/update_status/`, {
      method: "PATCH",
      body: JSON.stringify({ status, remarks, field_photo_urls }),
    }),
  runSlaSweep: () => request("/admin/run-sla-check/", { method: "POST" }),
};
