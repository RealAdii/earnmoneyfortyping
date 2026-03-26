import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary, #0a0a0a)",
        color: "var(--text-primary, #e0e0e0)",
        fontFamily: "'JetBrains Mono', monospace",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ fontSize: "4rem", color: "#fe6c37", marginBottom: 16 }}>
        404
      </div>
      <div style={{ fontSize: "1.2rem", marginBottom: 8 }}>
        Page not found
      </div>
      <div style={{ color: "#666", fontSize: "0.9rem", marginBottom: 32 }}>
        This route doesn't exist. Maybe you mistyped it — ironic, for a typing game.
      </div>
      <Link
        href="/"
        style={{
          padding: "12px 32px",
          background: "transparent",
          border: "1px solid #fe6c37",
          borderRadius: 6,
          color: "#fe6c37",
          textDecoration: "none",
          fontSize: "0.9rem",
        }}
      >
        Back to Race
      </Link>
    </div>
  );
}
