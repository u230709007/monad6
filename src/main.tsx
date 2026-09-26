import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// WebAuthn rpId cannot be an IP address; passkeys are bound to "localhost".
if (location.hostname === "127.0.0.1")
  location.replace(location.href.replace("//127.0.0.1", "//localhost"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
