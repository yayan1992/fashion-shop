import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router";
import "./index.css";
import { Layout } from "./app/Layout";
import { BagProvider } from "./bag/BagProvider";
import { CatalogProvider } from "./catalog/CatalogProvider";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import ProductPage from "./pages/ProductPage";
import CheckoutPage from "./pages/CheckoutPage";
import InfoPage from "./pages/InfoPage";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";
import ShopPage from "./pages/ShopPage";

// VITE_STUDIO_ENABLED=false leaves the dashboard out of the build entirely,
// for a public demo of the store. The owner manages that store from a local copy.
const studioEnabled = import.meta.env.VITE_STUDIO_ENABLED !== "false";

const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "shop", element: <ShopPage /> },
      { path: "products/:slug", element: <ProductPage /> },
      { path: "checkout", element: <CheckoutPage /> },
      { path: "order/:reference", element: <OrderConfirmationPage /> },
      { path: "info", element: <InfoPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

// The dashboard is loaded only when an administrator opens it.
if (studioEnabled) {
  routes.unshift({ path: "admin/*", lazy: async () => ({ Component: (await import("./admin/AdminApp")).default }) });
}

// The showroom's simulated dashboard: fictional, browser-local data, no login
// and no backend. Only the demo build has it; /admin stays the real Studio.
if (__DEMO_DASHBOARD__) {
  routes.unshift({ path: "demo/admin/*", lazy: async () => ({ Component: (await import("./demo/DemoAdminApp")).default }) });
}

// The untouched original component and demo, kept for side-by-side comparison
// while developing. Not included in production builds.
if (import.meta.env.DEV) {
  routes.unshift({ path: "lab/original-rail", lazy: async () => ({ Component: (await import("./baseline/rail-demo.original")).default }) });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CatalogProvider>
      <BagProvider>
        <RouterProvider router={createBrowserRouter(routes)} />
      </BagProvider>
    </CatalogProvider>
  </StrictMode>,
);
