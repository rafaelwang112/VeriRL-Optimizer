import React from "react";
import "./index.css";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Optimizer from "./pages/Optimizer"; // your file
// If you have a Home page, import it; else make optimizer default.
const router = createBrowserRouter([
  { path: "/", element: <Optimizer /> },          // default to Optimizer
  { path: "/optimizer", element: <Optimizer /> }, // explicit route
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
