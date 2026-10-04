import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/aircraft", "routes/api.aircraft.ts"),
] satisfies RouteConfig;
