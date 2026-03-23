"use client";

import { useEventTracking } from "@umami_router/sdk";

export default function TrackedButton() {
  const { trackEvent } = useEventTracking();

  const handleClick = async () => {
    await trackEvent("test_button_click", {
      type: "primary",
      location: "home_page",
    });
    alert("Event tracked: test_button_click");
  };

  return (
    <button
      onClick={handleClick}
      style={{
        padding: "0.75rem 1.5rem",
        fontSize: "1rem",
        backgroundColor: "#0070f3",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "bold",
      }}
    >
      Track Click
    </button>
  );
}
